// Server-only: classify unknown ingredients via Lovable AI and persist them
// to the ingredients table so the database learns over time.
import type { KnownIngredient, IngredientCategory } from "./analyzer";

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
- explanation: plain English, under 25 words.
- name: clean canonical name (Title Case, no percentages).
- aliases: 0-4 common alternate spellings, lowercase.

Return ONLY JSON matching: {"ingredients":[{"input":string,"name":string,"vegan":boolean|null,"vegetarian":boolean|null,"category":string,"confidence":number,"explanation":string,"aliases":string[]}]}`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `Classify these ingredients. Preserve the "input" string exactly.\n\n${list}\n\nReturn JSON now.`,
        },
      ],
    }),
  });
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
For each ingredient, use Google Search to check:
1. The manufacturer's official website / FAQ / customer-service statements for THIS specific product.
2. Reputable databases (PETA, Vegan Society, Barnivore, Open Food Facts, EFSA).
3. Peer-reviewed or trade sources describing how this additive is produced.

Only mark vegan=true/false or vegetarian=true/false when a credible source confirms it for this product or, if none, for the ingredient in general practice. If sources conflict or are silent, keep vegan=null and vegetarian=null and explain what you found and why it is still uncertain.

Return ONLY JSON matching:
{"verdicts":[{"token":string,"vegan":boolean|null,"vegetarian":boolean|null,"confidence":number,"explanation":string,"sources":string[],"manufacturer_confirms":boolean}]}
- explanation: <=35 words, plain English, mention the source in prose.
- sources: up to 3 URLs actually used.
- confidence: 0.0-1.0. Use <=0.5 if still uncertain.`;

  const user = `Product: ${productLine}
Ingredients to investigate:
${list}

Search the web now and return the JSON.`;

  let res: Response;
  try {
    res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        response_format: { type: "json_object" },
        // OpenRouter web-search plugin — enables live grounding with URL citations.
        // (The Gemini-native `tools: [{ type: "google_search" }]` field is
        // rejected on this path with MALFORMED_FUNCTION_CALL.)
        plugins: [{ id: "web", max_results: 5 }],
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
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
