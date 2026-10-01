// Server-only: classify unknown ingredients via Lovable AI and persist them
// to the ingredients table so the database learns over time.
import type { KnownIngredient, IngredientCategory } from "./analyzer";

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const AI_TIMEOUT_MS = 15_000;

// Bound every AI call so one slow web-research pass can't stall a whole scan.
async function aiFetch(key: string, body: unknown, timeoutMs = AI_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(AI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

interface AiIngredient {
  input: string;
  name: string;
  vegan: boolean | null;
  vegetarian: boolean | null;
  category: IngredientCategory;
  confidence: number;
  explanation: string;
  aliases?: string[];
}

async function classifyWithAi(tokens: string[]): Promise<AiIngredient[]> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  const list = tokens.map((t, i) => `${i + 1}. ${t}`).join("\n");
  const system = `You are a food ingredient expert. Classify each ingredient as vegetarian and/or vegan.

Rules:
- Never guess. If an ingredient can come from either plant or animal sources and there is no manufacturer-specific info, set vegan=null and vegetarian=null (Uncertain).
- If confirmed plant/mineral/microbial/synthetic: vegan=true, vegetarian=true.
- If dairy, egg, or honey only: vegan=false, vegetarian=true.
- If meat, fish, gelatin, rennet, carmine, shellac, isinglass, lard, tallow: vegan=false, vegetarian=false.
- category: one of plant, animal, microbial, mineral, synthetic, unknown.
- confidence: 0.0 to 1.0. Use <=0.6 when uncertain.
- explanation: plain English, under 18 words.
- name: clean canonical name (Title Case, no percentages).
- aliases: 0-4 common alternate spellings, lowercase.

Return ONLY JSON matching: {"ingredients":[{"input":string,"name":string,"vegan":boolean|null,"vegetarian":boolean|null,"category":string,"confidence":number,"explanation":string,"aliases":string[]}]}`;

  const res = await aiFetch(key, ({
      model: "google/gemini-2.5-flash",
      response_format: { type: "json_object" },
      messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: `Classify these ingredients. Preserve the "input" string exactly.\n\n${list}\n\nReturn JSON now.`,
      },
      ],
    }))
  if (res.status === 429) throw new Error("AI rate limited");
  if (res.status === 402) throw new Error("AI credits exhausted");
  if (!res.ok) throw new Error(`AI classify failed (${res.status})`);
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const raw = json.choices?.[0]?.message?.content?.trim() ?? "{}";
  let parsed: { ingredients?: AiIngredient[] } = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) parsed = JSON.parse(m[0]);
  }
  return (parsed.ingredients ?? []).filter((i) => i && i.input && i.name);
}

/**
 * Given a list of raw unknown ingredient tokens (already normalized/lowercased),
 * ask AI to classify each, persist them, and return the newly-known records.
 * De-duplicates against existing rows via slug + alias match.
 */
export async function learnUnknownIngredients(
  tokens: string[],
): Promise<KnownIngredient[]> {
  const uniq = Array.from(new Set(tokens.map((t) => t.trim().toLowerCase()).filter(Boolean)));
  if (uniq.length === 0) return [];

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const client = supabaseAdmin as unknown as import("@supabase/supabase-js").SupabaseClient;

  // Skip tokens already present as name or alias
  const { data: existing } = await client
    .from("ingredients")
    .select("slug,name,aliases,category,vegan,vegetarian,explanation,e_number");
  const known = new Set<string>();
  for (const row of (existing ?? []) as KnownIngredient[]) {
    known.add(row.name.toLowerCase());
    for (const a of row.aliases ?? []) known.add(a.toLowerCase());
  }
  const toAsk = uniq.filter((t) => !known.has(t)).slice(0, 20); // cap per request
  if (toAsk.length === 0) return [];

  let classified: AiIngredient[] = [];
  try {
    classified = await classifyWithAi(toAsk);
  } catch (err) {
    console.error("[learn] AI classify failed:", err);
    return [];
  }

  const rows = classified.map((c) => {
    const aliases = Array.from(
      new Set(
        [c.input.toLowerCase(), ...(c.aliases ?? []).map((a) => a.toLowerCase())].filter(
          (a) => a && a !== c.name.toLowerCase(),
        ),
      ),
    );
    return {
      slug: slugify(c.name) || slugify(c.input),
      name: c.name,
      aliases,
      category: c.category ?? "unknown",
      vegan: c.vegan,
      vegetarian: c.vegetarian,
      explanation: c.explanation ?? "",
      confidence: Math.max(0, Math.min(1, Number(c.confidence) || 0)),
      source: "ai_generated",
      verification: "ai_generated",
      e_number: null as string | null,
      last_verified_at: new Date().toISOString(),
    };
  });

  if (rows.length === 0) return [];

  const { data: inserted, error } = await client
    .from("ingredients")
    .upsert(rows as never, { onConflict: "slug", ignoreDuplicates: true })
    .select("slug,name,aliases,category,vegan,vegetarian,explanation,e_number");
  if (error) {
    console.error("[learn] insert failed:", error);
    return [];
  }
  return (inserted ?? []) as KnownIngredient[];
}

export interface ResearchVerdict {
  token: string;
  vegan: boolean | null;
  vegetarian: boolean | null;
  confidence: number;
  explanation: string;
  sources: string[];
  manufacturer_confirms?: boolean;
}

/**
 * Deep-research pass for ingredients still uncertain after DB + classify.
 * Uses Gemini with Google Search grounding to check the manufacturer's site
 * and the wider web before giving up with "Unable to Confirm".
 */
export async function researchUncertain(
  uncertain: { token: string; name: string }[],
  ctx: { brand?: string | null; productName?: string | null },
): Promise<ResearchVerdict[]> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key || uncertain.length === 0) return [];
  const list = uncertain.map((u, i) => `${i + 1}. ${u.name} (raw: "${u.token}")`).join("\n");
  const productLine = [ctx.brand, ctx.productName].filter(Boolean).join(" — ") || "an unspecified product";

  const system = `You are a food-ingredient investigator with web search.

Verification priority (use in this order, stop at the first that yields a credible answer):
1. The manufacturer's official website, product page, ingredient/allergen page, FAQ, or written customer-service statement for THIS specific product.
2. Official vegan/vegetarian certifications (Vegan Society, Certified Vegan, V-Label, PETA's verified brand list).
3. Trusted food/ingredient databases (Open Food Facts, EFSA, FDA, Barnivore for beverages).

DO NOT use random blogs, personal websites, Reddit, Quora, discussion forums, unverified news posts, AI-generated summaries, or aggregator content farms as evidence. If the only sources you find are those, treat the ingredient as unverified.

Only mark vegan=true/false or vegetarian=true/false when a source from tiers 1-3 above confirms it. If nothing from those tiers can be found, keep vegan=null and vegetarian=null and briefly explain what could not be verified — do not guess.

Return ONLY JSON matching:
{"verdicts":[{"token":string,"vegan":boolean|null,"vegetarian":boolean|null,"confidence":number,"explanation":string,"sources":string[],"manufacturer_confirms":boolean}]}
- explanation: <=20 words, plain English. If unverified, say so plainly ("Source not confirmed; verdict is based on the other ingredients.").
- sources: up to 3 URLs actually used, only from tiers 1-3.
- manufacturer_confirms: true only if tier 1 explicitly confirms the status for this product.
- confidence: 0.0-1.0. Use <=0.4 when unverified.`;

  const user = `Product: ${productLine}
Ingredients to investigate:
${list}

Search the web now and return the JSON.`;

  let res: Response;
  try {
    res = await aiFetch(key, ({
      model: "google/gemini-2.5-flash",
      response_format: { type: "json_object" },
      // OpenRouter web-search plugin — enables live grounding with URL citations.
      // (The Gemini-native `tools: [{ type: "google_search" }]` field is
      // rejected on this path with MALFORMED_FUNCTION_CALL.)
      plugins: [{ id: "web", max_results: 5 }],
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      }))
  } catch (err) {
    console.error("[research] network error:", err);
    return [];
  }
  if (!res.ok) {
    console.error("[research] AI failed", res.status, await res.text().catch(() => ""));
    return [];
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = json.choices?.[0]?.message?.content?.trim() ?? "{}";
  let parsed: { verdicts?: ResearchVerdict[] } = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      try { parsed = JSON.parse(m[0]); } catch { /* ignore */ }
    }
  }
  return (parsed.verdicts ?? []).filter((v) => v && v.token);
}

/**
 * Given a product identified from a front-of-package photo, use Gemini with
 * web search to find its ingredient list from the manufacturer or retailer.
 * Returns null if nothing credible was found.
 */
export async function findIngredientsOnWeb(ctx: {
  brand?: string | null;
  productName?: string | null;
}): Promise<{ ingredients: string; sources: string[] } | null> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return null;
  const query = [ctx.brand, ctx.productName].filter(Boolean).join(" ").trim();
  if (!query) return null;

  const system = `You are a food-label researcher with web search. Find the full ingredient list for the specified product from the most authoritative source you can — the manufacturer's official website first, then major retailers (Amazon, Target, Walmart, Tesco, etc.), then Open Food Facts. Return ONLY JSON: {"ingredients": string|null, "sources": string[]}. "ingredients" = the ingredient list copied verbatim as a comma-separated string (no marketing prose, no nutrition facts). Return null if you cannot find a credible ingredient list. "sources" = up to 3 URLs you used.`;

  const user = `Product: ${query}\nFind and return its ingredient list now.`;

  let res: Response;
  try {
    res = await aiFetch(key, ({
      model: "google/gemini-2.5-flash",
      response_format: { type: "json_object" },
      plugins: [{ id: "web", max_results: 5 }],
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      }))
  } catch (err) {
    console.error("[find-ingredients] network error:", err);
    return null;
  }
  if (!res.ok) {
    console.error("[find-ingredients] AI failed", res.status);
    return null;
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = json.choices?.[0]?.message?.content?.trim() ?? "{}";
  let parsed: { ingredients?: string | null; sources?: string[] } = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      try { parsed = JSON.parse(m[0]); } catch { /* ignore */ }
    }
  }
  const ingredients = (parsed.ingredients ?? "").trim();
  if (!ingredients || ingredients.length < 10) return null;
  return { ingredients, sources: (parsed.sources ?? []).slice(0, 3) };
}

export interface ProductVerdict {
  status: "vegan" | "vegetarian" | "not_vegetarian" | "unknown";
  confidence: number;
  explanation: string;
  sources: string[];
  manufacturer_confirms: boolean;
}

/**
 * Last-resort, product-level research used only when the ingredient list plus
 * ingredient-level research still leaves the verdict uncertain. Checks the
 * manufacturer's own site/FAQ first, then certifications and reputable food
 * databases, before we are allowed to show "Uncertain".
 */
export async function researchProductVerdict(ctx: {
  brand?: string | null;
  productName?: string | null;
  ingredientsText?: string | null;
  ambiguous?: string[];
}): Promise<ProductVerdict | null> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return null;
  const product = [ctx.brand, ctx.productName].filter(Boolean).join(" ").trim();
  if (!product) return null;

  const system = `You determine whether a specific packaged food product is vegan, vegetarian, or neither.

Search in this strict order and stop at the first credible answer:
1. The manufacturer's official website for THIS product: product page, ingredient/allergen page, FAQ, dietary/suitability statement, or a written customer-service reply.
2. Official certifications (Vegan Society, Certified Vegan, V-Label, PETA verified brand list) and the brand's official social/press statements.
3. Reputable food databases (Open Food Facts, EFSA, FDA, Barnivore).

Never use blogs, Reddit, Quora, forums, or content farms as evidence.

Return ONLY JSON: {"status":"vegan"|"vegetarian"|"not_vegetarian"|"unknown","confidence":number,"explanation":string,"sources":string[],"manufacturer_confirms":boolean}
- Use "unknown" only if tiers 1-3 give nothing or clearly conflict.
- explanation: <=25 words, plain English. If ambiguous ingredients (sugar, natural flavors, enzymes, mono- and diglycerides) were resolved, say briefly what the evidence showed.
- sources: up to 3 URLs actually used, tiers 1-3 only.
- manufacturer_confirms: true only if tier 1 explicitly states the dietary status.`;

  const user = `Product: ${product}
${ctx.ingredientsText ? `Ingredients: ${ctx.ingredientsText.slice(0, 1200)}\n` : ""}${ctx.ambiguous?.length ? `Ambiguous ingredients blocking a verdict: ${ctx.ambiguous.join(", ")}\n` : ""}
Search the manufacturer's site first, then trusted sources, and return the JSON.`;

  let res: Response;
  try {
    res = await aiFetch(key, ({
      model: "google/gemini-2.5-flash",
      response_format: { type: "json_object" },
      plugins: [{ id: "web", max_results: 5 }],
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      }))
  } catch (err) {
    console.error("[product-research] network error:", err);
    return null;
  }
  if (!res.ok) {
    console.error("[product-research] AI failed", res.status);
    return null;
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = json.choices?.[0]?.message?.content?.trim() ?? "{}";
  let parsed: Partial<ProductVerdict> = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      try { parsed = JSON.parse(m[0]); } catch { /* ignore */ }
    }
  }
  if (!parsed.status) return null;
  return {
    status: parsed.status,
    confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
    explanation: (parsed.explanation ?? "").trim(),
    sources: (parsed.sources ?? []).slice(0, 3),
    manufacturer_confirms: Boolean(parsed.manufacturer_confirms),
  };
}

export interface RennetVerdict {
  rennet: "vegetarian" | "animal" | "unknown";
  explanation: string;
  sources: string[];
  manufacturer_confirms: boolean;
}

/**
 * Dedicated research pass for dairy-cheese products whose label does not say
 * whether the cheese uses animal or microbial rennet. Manufacturer site first,
 * then reputable sources. Never guesses: returns "unknown" when unproven.
 */
export async function researchRennet(ctx: {
  brand?: string | null;
  productName?: string | null;
  cheeseTerm: string;
  ingredientsText?: string | null;
}): Promise<RennetVerdict | null> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return null;
  const product = [ctx.brand, ctx.productName].filter(Boolean).join(" ").trim();
  if (!product) return null;

  const system = `You verify whether the cheese in a specific packaged food product is made with vegetarian (microbial / fermentation-produced chymosin / non-animal) rennet or animal rennet.

Search in this strict order and stop at the first credible answer:
1. The manufacturer's official website for THIS product: product page, ingredient/allergen page, FAQ, dietary/suitability statement, or a written customer-service reply.
2. Official certifications (Vegetarian Society, V-Label, Certified Vegan) and the brand's official statements.
3. Reputable food databases and cheese producers' official pages (Open Food Facts, PDO/DOP rules — e.g. Parmigiano Reggiano, Grana Padano, Pecorino Romano and Gruyère AOP require animal rennet by law).

Never use blogs, Reddit, Quora, forums, or content farms as evidence. Never guess.

Return ONLY JSON: {"rennet":"vegetarian"|"animal"|"unknown","explanation":string,"sources":string[],"manufacturer_confirms":boolean}
- "vegetarian" only if evidence explicitly confirms microbial rennet, FPC, non-animal/vegetable rennet, or a vegetarian-suitable claim for this product.
- "animal" only if evidence explicitly confirms animal/calf rennet.
- "unknown" whenever evidence is missing, vague, or conflicting.
- explanation: <=22 words, plain English, no citations inside the text.
- sources: up to 3 URLs actually used.
- manufacturer_confirms: true only if tier 1 explicitly states it.`;

  const user = `Product: ${product}
Cheese-related ingredient needing verification: ${ctx.cheeseTerm}
${ctx.ingredientsText ? `Ingredients: ${ctx.ingredientsText.slice(0, 1200)}\n` : ""}
Determine the rennet type and return the JSON.`;

  let res: Response;
  try {
    res = await aiFetch(key, ({
      model: "google/gemini-2.5-flash",
      response_format: { type: "json_object" },
      plugins: [{ id: "web", max_results: 5 }],
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      }))
  } catch (err) {
    console.error("[rennet-research] network error:", err);
    return null;
  }
  if (!res.ok) {
    console.error("[rennet-research] AI failed", res.status);
    return null;
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = json.choices?.[0]?.message?.content?.trim() ?? "{}";
  let parsed: Partial<RennetVerdict> = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      try { parsed = JSON.parse(m[0]); } catch { /* ignore */ }
    }
  }
  const rennet = parsed.rennet === "vegetarian" || parsed.rennet === "animal" ? parsed.rennet : "unknown";
  return {
    rennet,
    explanation: (parsed.explanation ?? "").trim(),
    sources: (parsed.sources ?? []).slice(0, 3),
    manufacturer_confirms: Boolean(parsed.manufacturer_confirms),
  };
}

/**
 * Barcode not in Open Food Facts? Use web search to identify the product from
 * its UPC/EAN and pull its ingredient list from the manufacturer or a major
 * retailer. Returns null when nothing credible is found.
 */
export async function findProductByBarcodeOnWeb(barcode: string): Promise<{
  name: string | null;
  brand: string | null;
  ingredients: string;
  sources: string[];
} | null> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return null;
  if (!/^\d{6,14}$/.test(barcode)) return null;

  const system = `You identify packaged food products from a UPC/EAN barcode using web search. Search the barcode number on the manufacturer's site and major retailers (Walmart, Target, Amazon, Kroger, Tesco), plus barcode databases (UPCitemdb, Barcode Lookup, Open Food Facts). Return ONLY JSON: {"name":string|null,"brand":string|null,"ingredients":string|null,"sources":string[]}. "ingredients" = the full ingredient list copied verbatim as a comma-separated string, no nutrition facts or marketing text. Return null fields you cannot verify. Never invent ingredients.`;

  let res: Response;
  try {
    res = await aiFetch(key, ({
      model: "google/gemini-2.5-flash",
      response_format: { type: "json_object" },
      plugins: [{ id: "web", max_results: 5 }],
      messages: [
        { role: "system", content: system },
        { role: "user", content: `Barcode: ${barcode}\nIdentify this product and return its ingredient list.` },
      ],
      }))
  } catch (err) {
    console.error("[barcode-web] network error:", err);
    return null;
  }
  if (!res.ok) {
    console.error("[barcode-web] AI failed", res.status);
    return null;
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = json.choices?.[0]?.message?.content?.trim() ?? "{}";
  let parsed: { name?: string | null; brand?: string | null; ingredients?: string | null; sources?: string[] } = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      try { parsed = JSON.parse(m[0]); } catch { /* ignore */ }
    }
  }
  const ingredients = (parsed.ingredients ?? "").trim();
  if (!ingredients || ingredients.length < 10) return null;
  return {
    name: (parsed.name ?? "").trim() || null,
    brand: (parsed.brand ?? "").trim() || null,
    ingredients,
    sources: (parsed.sources ?? []).slice(0, 3),
  };
}

// -------- Find Alternatives: Stage 1 (candidate discovery only) --------
// The model ONLY proposes similar products. It never decides dietary status —
// every candidate is verified separately by the normal scan pipeline.
export interface AlternativeCandidate {
  name: string;
  brand: string | null;
  why_similar: string[];
}

export async function discoverAlternatives(ctx: {
  name: string;
  brand: string | null;
  category: string | null;
  ingredients: string | null;
  reason: string;
  preference: "vegan" | "vegetarian";
  priorities: string[];
  note: string | null;
}): Promise<{ intent: string; candidates: AlternativeCandidate[] }> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  const system = `You help shoppers find real, currently sold packaged food products similar to one they scanned.
Your job is ONLY candidate discovery. Do not claim any product is vegan or vegetarian — a separate system verifies that from ingredients.
Suggest products that are likely to suit a ${ctx.preference} diet and are similar in category, format, flavor and use. Prefer well-known brands with widely published ingredient lists. Never suggest the scanned product itself. Never invent products.
Return ONLY JSON: {"intent": string, "candidates":[{"name": string, "brand": string, "why_similar": string[]}]}
- intent: one sentence, what the shopper probably wants (e.g. "A crunchy cheddar-style cracker that is vegan").
- candidates: 8 items, best match first. name = exact product name as sold, brand = brand name.
- why_similar: 2-3 short phrases (under 7 words each) about similarity only (category, flavor, texture, price). No dietary claims.`;
  const user = `Scanned product: ${ctx.name}${ctx.brand ? ` by ${ctx.brand}` : ""}
Category: ${ctx.category ?? "unknown"}
Ingredients: ${(ctx.ingredients ?? "unknown").slice(0, 1200)}
Why it does not fit: ${ctx.reason}
Shopper's diet: ${ctx.preference}
What matters most: ${ctx.priorities.length ? ctx.priorities.join(", ") : "no preference"}
Extra request: ${ctx.note || "none"}`;
  const res = await aiFetch(
    key,
    {
      model: "openai/gpt-6-astra",
      reasoning_effort: "low",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    },
    40_000,
  );
  if (res.status === 429) throw new Error("VegSeal is busy right now. Please try again in a moment.");
  if (res.status === 402) throw new Error("AI credits are used up. Please try again later.");
  if (!res.ok) throw new Error(`Couldn't search for alternatives (${res.status})`);
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = json.choices?.[0]?.message?.content?.trim() ?? "{}";
  let parsed: { intent?: string; candidates?: AlternativeCandidate[] } = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      try { parsed = JSON.parse(m[0]); } catch { /* ignore */ }
    }
  }
  const candidates = (parsed.candidates ?? [])
    .filter((c) => c && typeof c.name === "string" && c.name.trim())
    .slice(0, 8)
    .map((c) => ({
      name: c.name.trim(),
      brand: c.brand?.toString().trim() || null,
      why_similar: (Array.isArray(c.why_similar) ? c.why_similar : []).map(String).slice(0, 3),
    }));
  return { intent: parsed.intent?.toString() ?? "", candidates };
}
