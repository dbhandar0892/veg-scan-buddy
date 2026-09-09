import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import {
  analyzeText,
  deriveStatusFromHits,
  detectCheeseAmbiguity,
  hasNonVegetarianEvidence,
  type AnalysisResult,
  type KnownIngredient,
  type Status,
} from "./analyzer";

function serverSupabase() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
}

// The verified ingredient table is large and changes rarely; cache it briefly
// in memory so repeat scans skip the full table download.
let ingredientCache: { at: number; rows: KnownIngredient[] } | null = null;
const INGREDIENT_CACHE_MS = 60_000;

async function loadKnownIngredients(): Promise<KnownIngredient[]> {
  if (ingredientCache && Date.now() - ingredientCache.at < INGREDIENT_CACHE_MS) {
    return ingredientCache.rows;
  }
  const supabase = serverSupabase();
  const { data, error } = await supabase
    .from("ingredients")
    .select("slug,name,aliases,category,vegan,vegetarian,explanation,e_number");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as KnownIngredient[];
  ingredientCache = { at: Date.now(), rows };
  return rows;
}


function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

// Self-learning: DB → AI classify → web-research any still-uncertain items.

async function analyzeAndLearn(
  text: string,
  ctx: { brand?: string | null; productName?: string | null } = {},
): Promise<AnalysisResult> {
  const known = await loadKnownIngredients();
  let result = analyzeText(text, known);

  // Speed: the cheese/rennet check (step 4) only depends on the raw label text
  // and product context, never on the AI passes below. Kick it off now so it
  // runs in parallel with the ingredient research instead of after it.
  const cheeseUpfront = detectCheeseAmbiguity(text, ctx.productName ?? null);
  const rennetPromise = cheeseUpfront
    ? import("./learn.server")
        .then(({ researchRennet }) =>
          researchRennet({
            brand: ctx.brand ?? null,
            productName: ctx.productName ?? null,
            cheeseTerm: cheeseUpfront.term,
            ingredientsText: text,
          }),
        )
        .catch(() => null)
    : null;


  // Step 1: classify brand-new tokens (adds to global DB).
  const unknownTokens = result.hits
    .filter((h) => h.slug === null && h.category === "unknown")
    .map((h) => h.token);
  if (unknownTokens.length > 0) {
    const { learnUnknownIngredients } = await import("./learn.server");
    const learned = await learnUnknownIngredients(unknownTokens);
    if (learned.length > 0) {
      result = analyzeText(text, [...known, ...learned]);
      // Keep the in-memory cache in sync with freshly learned ingredients.
      ingredientCache = { at: Date.now(), rows: [...known, ...learned] };
    }

  }

  // Step 2: if ANY hit is still ambiguous — generic terms like "spices",
  // "natural flavors", "colour", "sugar", or brand-new tokens — do a live
  // web-research pass with the product/brand as context so we can check the
  // manufacturer's own statements and reputable vegan/vegetarian databases
  // before falling back to "Unable to Confirm". We run this even when the
  // overall status is already vegetarian/vegan, so a "vegetarian" verdict
  // can be upgraded to "vegan" once ambiguous items are pinned down.
  const uncertain = result.hits
    .filter(
      (h) =>
        (h.category === "unknown" && h.slug === null) ||
        h.vegan === null ||
        h.vegetarian === null,
    )
    .slice(0, 10)
    .map((h) => ({ token: h.token, name: h.name }));
  if (uncertain.length > 0) {
    {
      const { researchUncertain } = await import("./learn.server");
      const verdicts = await researchUncertain(uncertain, ctx);
      if (verdicts.length > 0) {
        const uncertainKeys = new Set(
          uncertain.map(({ token, name }) => `${token.trim().toLowerCase()}|${name.trim().toLowerCase()}`),
        );
        // The AI sometimes echoes the raw token, sometimes the display name.
        // Index by both, plus a loose contains-match as a last resort.
        const byKey = new Map<string, (typeof verdicts)[number]>();
        for (const v of verdicts) byKey.set(v.token.trim().toLowerCase(), v);
        const findVerdict = (h: (typeof result.hits)[number]) => {
          const t = h.token.trim().toLowerCase();
          const n = h.name.trim().toLowerCase();
          return (
            byKey.get(t) ??
            byKey.get(n) ??
            verdicts.find((v) => {
              const vt = v.token.trim().toLowerCase();
              return vt.includes(t) || t.includes(vt) || vt.includes(n) || n.includes(vt);
            })
          );
        };
        const patched = result.hits.map((h) => {
          const hitKey = `${h.token.trim().toLowerCase()}|${h.name.trim().toLowerCase()}`;
          // Never let research for an ambiguous ingredient overwrite a
          // separate ingredient that the verified database already resolved.
          if (!uncertainKeys.has(hitKey)) return h;
          const v = findVerdict(h);
          if (!v) return h;
          // Research must name credible animal-derived evidence before it can
          // turn a vegetarian-safe or unknown ingredient into non-vegetarian.
          // Dairy and eggs make a product non-vegan, not non-vegetarian.
          const researchedVegetarian =
            v.vegetarian === false &&
            h.vegetarian !== false &&
            !hasNonVegetarianEvidence(v.token, v.explanation)
              ? h.vegetarian
              : v.vegetarian;
          const confirmedBy =
            v.sources.length > 0
              ? ` Confirmed by ${v.sources.map((s) => domainOf(s)).filter(Boolean).slice(0, 2).join(", ")}.`
              : "";
          const prefix =
            v.vegan === true || v.vegetarian === true
              ? "Confirmed plant-based by independent sources. "
              : "";
          return {
            ...h,
            vegan: v.vegan,
            vegetarian: researchedVegetarian,
            explanation: `${prefix}${v.explanation}${confirmedBy}`.trim(),
            sources: v.sources.slice(0, 3),
          };
        });
        const manufacturerConfirmed = verdicts.some((v) => v.manufacturer_confirms);
        const derived = deriveStatusFromHits(patched);
        let finalStatus = derived.status;
        let finalExplanation = derived.explanation;
        let finalConfidence = derived.confidence;

        let verification: "unverified" | "community" | "manufacturer" =
          manufacturerConfirmed ? "manufacturer" : "community";

        if (manufacturerConfirmed) {
          const meatLike = patched.find((h) => h.vegetarian === false);
          const nonVegan = patched.find((h) => h.vegan === false && h.vegetarian !== false);
          if (meatLike) {
            // Stricter verdict wins — drop the manufacturer badge so the UI
            // doesn't show a contradictory "company confirms vegetarian" line
            // under a "not vegetarian" verdict.
            finalStatus = "not_vegetarian";
            finalExplanation = derived.status === "not_vegetarian"
              ? derived.explanation
              : `Contains ${meatLike.name.toLowerCase()}.`;
            verification = "community";

          } else if (nonVegan) {
            finalStatus = "vegetarian";
            finalExplanation = `Company confirms vegetarian friendly, but not vegan because of ${nonVegan.name.toLowerCase()}.`;
            finalConfidence = Math.max(finalConfidence, 0.9);
          } else {
            const allVegan = patched.every((h) => h.vegan === true || h.vegan === null);
            finalStatus = allVegan ? "vegan" : "vegetarian";
            finalExplanation = finalStatus === "vegan"
              ? "Company confirms this is vegan friendly."
              : "Company confirms this is vegetarian friendly.";
            finalConfidence = Math.max(finalConfidence, 0.9);
          }
        }

        // Never surface a "manufacturer confirms vegetarian" badge next to a
        // not-vegetarian verdict — that contradiction breaks user trust.
        if (finalStatus === "not_vegetarian" && verification === "manufacturer") {
          verification = "community";
        }

        result = {
          ...derived,
          status: finalStatus,
          explanation: finalExplanation,
          confidence: finalConfidence,
          verification,
        };
      }

    }
  }
  // Step 3: never return "Uncertain" without a product-level check of the
  // manufacturer's own information and reputable sources.
  if (result.status === "unknown") {
    const ambiguous = result.hits
      .filter((h) => h.vegan === null || h.vegetarian === null)
      .slice(0, 8)
      .map((h) => h.name);
    const { researchProductVerdict } = await import("./learn.server");
    const verdict = await researchProductVerdict({
      brand: ctx.brand ?? null,
      productName: ctx.productName ?? null,
      ingredientsText: text,
      ambiguous,
    });
    if (verdict && verdict.status !== "unknown") {
      const cited = verdict.sources.map((s) => domainOf(s)).filter(Boolean).slice(0, 2);
      const note = ambiguous.length
        ? ` ${ambiguous[0]} was unclear on the label; ${
            verdict.manufacturer_confirms ? "the manufacturer" : "trusted sources"
          } confirmed it${cited.length ? ` (${cited.join(", ")})` : ""}.`
        : cited.length
          ? ` Confirmed by ${cited.join(", ")}.`
          : "";
      result = {
        ...result,
        status: verdict.status,
        explanation: `${verdict.explanation}${note}`.trim(),
        confidence: Math.max(result.confidence, verdict.confidence || 0.75),
        verification: verdict.manufacturer_confirms ? "manufacturer" : "community",
      };
      if (result.status === "not_vegetarian" && result.verification === "manufacturer") {
        result = { ...result, verification: "community" };
      }
    }
  }

  // Step 4: Cheese & rennet gate. Dairy cheese is only vegetarian if the
  // rennet is microbial/FPC. Absence of "animal rennet" on the label is not
  // evidence, so verify before allowing a vegetarian verdict.
  if (result.status === "vegetarian" || result.status === "vegan") {
    const cheese = cheeseUpfront;
    const alreadyConfirmed =
      result.verification === "manufacturer" ||
      (result.verification === "community" && result.status === "vegan");
    if (cheese && !alreadyConfirmed) {
      const rv = await rennetPromise;

      const cited = (rv?.sources ?? []).map((s) => domainOf(s)).filter(Boolean).slice(0, 2);
      if (rv?.rennet === "animal") {
        result = {
          ...result,
          status: "not_vegetarian",
          explanation: `Contains ${cheese.term} made with animal rennet. Not vegetarian.${
            cited.length ? ` Confirmed by ${cited.join(", ")}.` : ""
          }`,
          confidence: Math.max(result.confidence, 0.85),
          verification: "community",
        };
      } else if (rv?.rennet === "vegetarian") {
        result = {
          ...result,
          explanation: `${result.explanation} The ${cheese.term} is made with vegetarian (non-animal) rennet${
            cited.length ? `, confirmed by ${cited.join(", ")}` : ""
          }.`,
          verification: rv.manufacturer_confirms ? "manufacturer" : "community",
          confidence: Math.max(result.confidence, 0.85),
        };
      } else {
        result = {
          ...result,
          status: "unknown",
          explanation: `This product contains cheese, but the manufacturer does not specify whether the cheese is made using vegetarian or animal rennet.`,
          confidence: Math.min(result.confidence, 0.5),
          verification: "unverified",
        };
      }
    }
  }

  if (!result.verification) {
    result = { ...result, verification: "unverified" };
  }
  return result;
}



export interface AnalyzedProduct {
  id: string;
  barcode: string | null;
  name: string;
  brand: string | null;
  image_url: string | null;
  ingredients_text: string | null;
  status: Status;
  confidence: number;
  explanation: string;
  ingredient_hits: AnalysisResult["hits"];
  verification: "unverified" | "community" | "manufacturer";
  source: string | null;
  last_analyzed_at: string;
}

async function upsertProduct(
  _supabase: ReturnType<typeof serverSupabase>,
  data: {
    barcode?: string | null;
    name: string;
    brand?: string | null;
    image_url?: string | null;
    category?: string | null;
    ingredients_text: string;
    analysis: AnalysisResult;
    source: string;
  },
): Promise<AnalyzedProduct> {
  const row = {
    barcode: data.barcode ?? null,
    name: data.name,
    brand: data.brand ?? null,
    image_url: data.image_url ?? null,
    category: data.category ?? null,
    ingredients_text: data.ingredients_text,
    status: data.analysis.status,
    confidence: data.analysis.confidence,
    explanation: data.analysis.explanation,
    ingredient_hits: data.analysis.hits as unknown as Database["public"]["Tables"] extends Record<string, never>
      ? never
      : never,
    verification: data.analysis.verification ?? "unverified",
    source: data.source,
    last_analyzed_at: new Date().toISOString(),
  };
  // Product cache writes are trusted server-side work — use the admin client
  // so RLS on `products` (public read-only) doesn't block the cache upsert.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const client = supabaseAdmin as unknown as ReturnType<typeof createClient>;
  const query = data.barcode
    ? client.from("products").upsert(row as never, { onConflict: "barcode" }).select().single()
    : client.from("products").insert(row as never).select().single();
  const { data: saved, error } = await query;
  if (error) throw new Error(error.message);
  const s = saved as unknown as AnalyzedProduct;
  return s;
}

// If a cached product is still uncertain, re-run analysis (which triggers the
// web-research pass with brand/name context). Newly-learned ingredients or a
// successful research pass can flip status from unknown → vegetarian/vegan.
// Returns the freshest record we have.
async function refreshIfUncertain(row: AnalyzedProduct): Promise<AnalyzedProduct> {
  if (row.status !== "unknown") return row;
  if (!row.ingredients_text) return row;
  try {
    const analysis = await analyzeAndLearn(row.ingredients_text, {
      brand: row.brand,
      productName: row.name,
    });
    if (analysis.status === row.status && analysis.confidence <= row.confidence) return row;
    return await upsertProduct(serverSupabase(), {
      barcode: row.barcode,
      name: row.name,
      brand: row.brand,
      image_url: row.image_url,
      ingredients_text: row.ingredients_text,
      analysis,
      source: row.source ?? "recheck",
    });
  } catch (err) {
    console.error("[recheck] failed:", err);
    return row;
  }
}

// -------- Barcode lookup via Open Food Facts --------
export async function lookupBarcodeCore(data: { barcode: string }): Promise<AnalyzedProduct | null> {
    const supabase = serverSupabase();
    const client = supabase as unknown as ReturnType<typeof createClient>;

    // Barcode variants: scanners report UPC-A (12) while databases often store
    // EAN-13 (leading zero) and vice versa.
    const raw = data.barcode.replace(/\D/g, "");
    const variants = Array.from(
      new Set(
        [raw, raw.replace(/^0+/, ""), raw.length === 12 ? `0${raw}` : "", raw.length === 13 && raw.startsWith("0") ? raw.slice(1) : ""].filter(
          (c) => c.length >= 6,
        ),
      ),
    );

    // Check cache first (any variant)
    const cached = await client
      .from("products")
      .select("*")
      .in("barcode", variants)
      .limit(1)
      .maybeSingle();
    if (cached.data) {
      return refreshIfUncertain(cached.data as unknown as AnalyzedProduct);
    }

    const headers = { "User-Agent": "VegSeal/1.0 (contact@vegseal.app)" };
    const fields = "product_name,brands,image_front_url,image_url,categories,ingredients_text_en,ingredients_text";
    type OffProduct = {
      product_name?: string;
      brands?: string;
      image_front_url?: string;
      image_url?: string;
      categories?: string;
      ingredients_text_en?: string;
      ingredients_text?: string;
    };

    let p: OffProduct | null = null;
    for (const code of variants) {
      const res = await fetchWithTimeout(
        `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${fields}`,
        { headers },
        5000,
      );
      if (!res?.ok) continue;
      try {
        const json = (await res.json()) as { status?: number; product?: OffProduct };
        if (json.status === 1 && json.product) {
          p = json.product;
          break;
        }
      } catch {
        // try next variant
      }
    }

    const offIngredients = p ? (p.ingredients_text_en || p.ingredients_text || "").trim() : "";

    // Found in Open Food Facts with a usable ingredient list.
    if (p && offIngredients) {
      const analysis = await analyzeAndLearn(offIngredients, {
        brand: p.brands ?? null,
        productName: p.product_name ?? null,
      });
      return upsertProduct(supabase, {
        barcode: data.barcode,
        name: p.product_name || "Unknown Product",
        brand: p.brands ?? null,
        image_url: p.image_front_url ?? p.image_url ?? null,
        category: p.categories ?? null,
        ingredients_text: offIngredients,
        analysis,
        source: "openfoodfacts",
      });
    }

    // Not in Open Food Facts, or listed without ingredients: research the web.
    const { findIngredientsOnWeb, findProductByBarcodeOnWeb } = await import("./learn.server");

    if (p && (p.product_name || p.brands)) {
      const found = await findIngredientsOnWeb({
        brand: p.brands ?? null,
        productName: p.product_name ?? null,
      });
      if (found) {
        const analysis = await analyzeAndLearn(found.ingredients, {
          brand: p.brands ?? null,
          productName: p.product_name ?? null,
        });
        return upsertProduct(supabase, {
          barcode: data.barcode,
          name: p.product_name || "Unknown Product",
          brand: p.brands ?? null,
          image_url: p.image_front_url ?? p.image_url ?? null,
          category: p.categories ?? null,
          ingredients_text: found.ingredients,
          analysis,
          source: "web",
        });
      }
      return null;
    }

    const viaWeb = await findProductByBarcodeOnWeb(raw);
    if (!viaWeb) return null;
    const analysis = await analyzeAndLearn(viaWeb.ingredients, {
      brand: viaWeb.brand,
      productName: viaWeb.name,
    });
    return upsertProduct(supabase, {
      barcode: data.barcode,
      name: viaWeb.name || "Scanned Product",
      brand: viaWeb.brand,
      ingredients_text: viaWeb.ingredients,
      analysis,
      source: "web",
    });
}

export const lookupBarcode = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ barcode: z.string().min(4).max(32) }).parse(input))
  .handler(async ({ data }) => lookupBarcodeCore(data));

// -------- Fast identify pass (no AI, no analysis) --------
// Used by the scanner so it can show the real product immediately and report
// truthful progress while the full analysis request runs.
export type BarcodeIdentity =
  | { kind: "cached"; product: AnalyzedProduct }
  | {
      kind: "found";
      name: string;
      brand: string | null;
      image_url: string | null;
      hasIngredients: boolean;
    }
  | { kind: "unidentified" };

export async function identifyBarcodeCore(data: { barcode: string }): Promise<BarcodeIdentity> {
    const supabase = serverSupabase();
    const client = supabase as unknown as ReturnType<typeof createClient>;
    const raw = data.barcode.replace(/\D/g, "");
    const variants = Array.from(
      new Set(
        [
          raw,
          raw.replace(/^0+/, ""),
          raw.length === 12 ? `0${raw}` : "",
          raw.length === 13 && raw.startsWith("0") ? raw.slice(1) : "",
        ].filter((c) => c.length >= 6),
      ),
    );

    const cached = await client.from("products").select("*").in("barcode", variants).limit(1).maybeSingle();
    if (cached.data) {
      const row = cached.data as unknown as AnalyzedProduct;
      // A cached-but-uncertain row still gets re-analyzed by lookupBarcode, so
      // only report it as a finished result when it is actually settled.
      if (row.status !== "unknown") return { kind: "cached", product: row };
      return {
        kind: "found",
        name: row.name,
        brand: row.brand,
        image_url: row.image_url,
        hasIngredients: Boolean(row.ingredients_text),
      };
    }

    const headers = { "User-Agent": "VegSeal/1.0 (contact@vegseal.app)" };
    const fields = "product_name,brands,image_front_url,image_url,ingredients_text_en,ingredients_text";
    for (const code of variants) {
      const res = await fetchWithTimeout(
        `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${fields}`,
        { headers },
        5000,
      );
      if (!res?.ok) continue;
      try {
        const json = (await res.json()) as {
          status?: number;
          product?: {
            product_name?: string;
            brands?: string;
            image_front_url?: string;
            image_url?: string;
            ingredients_text_en?: string;
            ingredients_text?: string;
          };
        };
        if (json.status === 1 && json.product) {
          const p = json.product;
          return {
            kind: "found",
            name: p.product_name || "Scanned product",
            brand: p.brands ?? null,
            image_url: p.image_front_url ?? p.image_url ?? null,
            hasIngredients: Boolean((p.ingredients_text_en || p.ingredients_text || "").trim()),
          };
        }
      } catch {
        // try next variant
      }
    }
    return { kind: "unidentified" };
}

export const identifyBarcode = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ barcode: z.string().min(4).max(32) }).parse(input))
  .handler(async ({ data }) => identifyBarcodeCore(data));


// -------- Analyze free-text ingredients (from OCR or paste) --------
export async function analyzeIngredientsCore(data: { text: string; name?: string }): Promise<AnalyzedProduct> {
    const supabase = serverSupabase();
    const analysis = await analyzeAndLearn(data.text, { productName: data.name ?? null });
    return upsertProduct(supabase, {
      name: data.name || "Scanned Ingredients",
      ingredients_text: data.text,
      analysis,
      source: "ocr",
    });
}

export const analyzeIngredients = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        text: z.string().min(1).max(8000),
        name: z.string().max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => analyzeIngredientsCore(data));

// -------- Analyze a photo: works for either an ingredient label OR a product shot --------
// The AI first tries to read the ingredient list. If none is visible (e.g. the
// user photographed the front of the package), it identifies the product by
// name/brand so we can look it up in Open Food Facts. When multiple plausible
// matches exist we hand the choice back to the user rather than guess.

export interface ProductCandidate {
  barcode: string;
  name: string;
  brand: string | null;
  image_url: string | null;
}

export type PhotoAnalysisResult =
  | { kind: "product"; product: AnalyzedProduct }
  | {
      kind: "candidates";
      query: string;
      brand: string | null;
      productName: string | null;
      candidates: ProductCandidate[];
    };

function isValidBarcodeLength(code: string) {
  return code.length === 8 || code.length === 12 || code.length === 13 || code.length === 14;
}

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(s: string) {
  return new Set(normalize(s).split(" ").filter((t) => t.length > 1));
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
  timeoutMs = 7000,
): Promise<Response | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// Score how well an OFF product matches the user's photo (brand + name tokens).
function scoreCandidate(
  candidate: { name: string; brand: string | null },
  wanted: { brand: string; productName: string },
): number {
  const wantedTokens = tokenSet(`${wanted.brand} ${wanted.productName}`);
  if (wantedTokens.size === 0) return 0;
  const haveTokens = tokenSet(`${candidate.brand ?? ""} ${candidate.name}`);
  let overlap = 0;
  for (const t of wantedTokens) if (haveTokens.has(t)) overlap += 1;
  let score = overlap / wantedTokens.size;
  if (wanted.brand) {
    const brandTokens = tokenSet(wanted.brand);
    let brandHits = 0;
    for (const t of brandTokens) if (haveTokens.has(t)) brandHits += 1;
    if (brandTokens.size > 0 && brandHits === brandTokens.size) score += 0.3;
  }
  return score;
}

export async function ocrIngredientsCore(data: { imageBase64: string; mime: string }): Promise<PhotoAnalysisResult> {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    const res = await fetchWithTimeout("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              'You are an OCR assistant for a food product photo. Return ONLY a compact JSON object with these keys: {"ingredients": string|null, "product_name": string|null, "brand": string|null, "barcode": string|null}. ' +
              '"ingredients" = the ingredient list read verbatim from the label as a comma-separated string. Read ALL visible ingredient text even if partial. Return null ONLY if no ingredient list is visible at all. Do not invent ingredients. ' +
              '"product_name" = the exact product name printed on the packaging, or null if unreadable. ' +
              '"brand" = the brand/manufacturer name as printed, or null. ' +
              '"barcode" = ONLY the digits if you can read every digit clearly, else null. Never partially guess a barcode. ' +
              "Output JSON only. No prose, no code fences.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Identify this product." },
              {
                type: "image_url",
                image_url: { url: `data:${data.mime};base64,${data.imageBase64}` },
              },
            ],
          },
        ],
      }),
    }, 18000);
    if (!res) throw new Error("Analysis took too long. Try scanning the ingredient list again, or enter the barcode.");
    if (res.status === 429) throw new Error("Rate limited. Please try again in a moment.");
    if (res.status === 402) throw new Error("AI credits exhausted. Add credits in workspace settings.");
    if (!res.ok) throw new Error(`Photo analysis failed (${res.status})`);
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = json.choices?.[0]?.message?.content?.trim() ?? "";
    const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    let parsed: {
      ingredients?: string | null;
      product_name?: string | null;
      brand?: string | null;
      barcode?: string | null;
    } = {};
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      if (cleaned && cleaned.toUpperCase() !== "NONE") {
        parsed = { ingredients: cleaned };
      }
    }

    const ingredients = (parsed.ingredients ?? "").trim();
    const productName = (parsed.product_name ?? "").trim();
    const brand = (parsed.brand ?? "").trim();
    const barcode = (parsed.barcode ?? "").replace(/\D/g, "");

    // 1) Ingredient list visible? Analyze it directly — the most reliable
    // path because we're reading actual label text, not guessing an identity.
    if (ingredients && ingredients.length > 8) {
      const supabase = serverSupabase();
      const analysis = await analyzeAndLearn(ingredients, {
        brand: brand || null,
        productName: productName || null,
      });
      const product = await upsertProduct(supabase, {
        name: productName || "Scanned Label",
        brand: brand || null,
        ingredients_text: ingredients,
        analysis,
        source: "ocr",
      });
      return { kind: "product", product };
    }

    // 2) Barcode visible? Only trust standard-length barcodes.
    if (barcode && isValidBarcodeLength(barcode)) {
      const viaBarcode = await lookupBarcode({ data: { barcode } });
      if (viaBarcode) return { kind: "product", product: viaBarcode };
    }

    // 3) Only front-of-package info? Search OFF and either auto-pick when
    // there's a confident match, or hand candidates back for the user.
    const searchTerm = [brand, productName].filter(Boolean).join(" ").trim();
    if (searchTerm) {
      const headers = { "User-Agent": "VegSeal/1.0 (contact@vegseal.app)" };
      const fields = "code,product_name,brands,image_front_small_url,image_small_url";
      type OffProduct = {
        code?: string;
        product_name?: string;
        brands?: string | string[];
        image_front_small_url?: string;
        image_small_url?: string;
      };
      const collected: OffProduct[] = [];
      const queries = Array.from(new Set([searchTerm]));
      if (brand && productName && brand !== productName) {
        queries.push(productName);
        queries.push(brand);
      }
      const searches = queries.flatMap((q) => {
        const encoded = encodeURIComponent(q);
        return [
          fetchWithTimeout(
            `https://search.openfoodfacts.org/search?q=${encoded}&page_size=8&fields=${fields}`,
            { headers },
          ).then(async (searchRes) => {
            if (!searchRes?.ok) return [] as OffProduct[];
            try {
              const j = (await searchRes.json()) as { hits?: OffProduct[] };
              return j.hits ?? [];
            } catch {
              return [] as OffProduct[];
            }
          }),
          fetchWithTimeout(
            `https://world.openfoodfacts.org/api/v2/search?search_terms=${encoded}&page_size=8&fields=${fields}`,
            { headers },
          ).then(async (searchRes) => {
            if (!searchRes?.ok) return [] as OffProduct[];
            try {
              const j = (await searchRes.json()) as { products?: OffProduct[] };
              return j.products ?? [];
            } catch {
              return [] as OffProduct[];
            }
          }),
        ];
      });
      const searchResults = await Promise.all(searches);
      for (const group of searchResults) collected.push(...group);

      const seen = new Set<string>();
      const candidates: ProductCandidate[] = [];
      for (const p of collected) {
        if (!p.code || !p.product_name) continue;
        const code = p.code.replace(/^0+/, "") || p.code;
        if (seen.has(code)) continue;
        seen.add(code);
        const b = Array.isArray(p.brands)
          ? p.brands.filter(Boolean).join(", ") || null
          : (p.brands ?? null);
        candidates.push({
          barcode: code,
          name: p.product_name,
          brand: b,
          image_url: p.image_front_small_url ?? p.image_small_url ?? null,
        });
        if (candidates.length >= 8) break;
      }

      if (candidates.length > 0) {
        const scored = candidates
          .map((c) => ({ c, score: scoreCandidate(c, { brand, productName }) }))
          .sort((a, b) => b.score - a.score);
        const top = scored[0];
        const second = scored[1];
        const confident =
          top.score >= 0.6 && (!second || top.score - second.score >= 0.15);
        if (confident) {
          try {
            const product = await lookupBarcode({ data: { barcode: top.c.barcode } });
            if (product) return { kind: "product", product };
          } catch {
            // fall through to candidate list
          }
        }
        return {
          kind: "candidates",
          query: searchTerm,
          brand: brand || null,
          productName: productName || null,
          candidates: scored.map((s) => s.c),
        };
      }

      // No OFF candidates — fall through to the web-search fallback below.
    }

    // 4) Last resort: use web search to find the ingredient list from the
    // manufacturer or a major retailer. This lets front-of-package photos
    // succeed even when the product isn't in Open Food Facts.
    if (productName || brand) {
      const { findIngredientsOnWeb } = await import("./learn.server");
      const found = await findIngredientsOnWeb({ brand, productName });
      if (found) {
        const supabase = serverSupabase();
        const analysis = await analyzeAndLearn(found.ingredients, {
          brand: brand || null,
          productName: productName || null,
        });
        const product = await upsertProduct(supabase, {
          name: productName || brand || "Scanned Product",
          brand: brand || null,
          ingredients_text: found.ingredients,
          analysis,
          source: "web",
        });
        return { kind: "product", product };
      }
      throw new Error(
        `We identified "${[brand, productName].filter(Boolean).join(" ")}" but couldn't find its ingredient list online. Try scanning the ingredient list instead.`,
      );
    }

    throw new Error(
      "We couldn't recognize the product or read an ingredient list. Try scanning the ingredient list again with better lighting, or enter the barcode manually.",
    );
}

export const ocrIngredients = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        imageBase64: z.string().min(100),
        mime: z.string().default("image/jpeg"),
      })
      .parse(input),
  )
  .handler(async ({ data }) => ocrIngredientsCore(data));


// -------- Search products --------
export async function searchProductsCore(data: { query: string }) {
    const supabase = serverSupabase();
    const client = supabase as unknown as ReturnType<typeof createClient>;
    const q = data.query.trim();
    // Escape PostgREST reserved chars for .or() filter values.
    const safe = q.replace(/[,()"']/g, " ").trim();
    const pattern = `%${safe}%`;
    const local = await client
      .from("products")
      .select("id,barcode,name,brand,image_url,status,confidence")
      .or(`name.ilike.${pattern},brand.ilike.${pattern}`)
      .limit(15);

    const localResults = (local.data ?? []) as Array<{
      id: string;
      barcode: string | null;
      name: string;
      brand: string | null;
      image_url: string | null;
      status: Status;
      confidence: number;
    }>;

    // Query Open Food Facts. Use the modern search-a-licious endpoint first
    // with a short timeout; only fall back to the legacy endpoints if we still
    // need more results. Every fetch is capped so one slow endpoint can't stall
    // the whole search.
    const headers = { "User-Agent": "VegSeal/1.0 (contact@vegseal.app)" };
    const fields = "code,product_name,brands,image_front_small_url,image_small_url";
    const encoded = encodeURIComponent(q);
    const pageSize = 12;
    const wantRemote = 12;

    type OffProduct = {
      code?: string;
      product_name?: string;
      brands?: string | string[];
      image_front_small_url?: string;
      image_small_url?: string;
    };

    const collected: OffProduct[] = [];
    const seen = new Set<string>();
    const addProducts = (products: OffProduct[]) => {
      for (const p of products) {
        if (!p.code || !p.product_name) continue;
        const barcode = p.code.replace(/^0+/, "") || p.code;
        if (seen.has(barcode)) continue;
        seen.add(barcode);
        collected.push(p);
        if (collected.length >= wantRemote) return true;
      }
      return false;
    };

    // Fast path: search-a-licious is usually the quickest and best ranked.
    const salRes = await fetchWithTimeout(
      `https://search.openfoodfacts.org/search?q=${encoded}&page_size=${pageSize}&fields=${fields}`,
      { headers },
      4500,
    );
    if (salRes && salRes.ok) {
      try {
        const j = (await salRes.json()) as { hits?: OffProduct[] };
        addProducts(j.hits ?? []);
      } catch {
        // ignore
      }
    }

    // Only hit the slower legacy endpoints if the modern one didn't give us
    // enough useful matches.
    if (collected.length < wantRemote) {
      const [v2Res, cgiRes] = await Promise.all([
        fetchWithTimeout(
          `https://world.openfoodfacts.org/api/v2/search?search_terms=${encoded}&page_size=${pageSize}&fields=${fields}`,
          { headers },
          4500,
        ),
        fetchWithTimeout(
          `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encoded}&search_simple=1&action=process&json=1&page_size=${pageSize}&fields=${fields}`,
          { headers },
          4500,
        ),
      ]);
      for (const res of [v2Res, cgiRes]) {
        if (collected.length >= wantRemote) break;
        if (!res || !res.ok) continue;
        try {
          const j = (await res.json()) as { products?: OffProduct[] };
          if (addProducts(j.products ?? [])) break;
        } catch {
          // ignore malformed responses
        }
      }
    }

    const offResults: Array<{
      barcode: string;
      name: string;
      brand: string | null;
      image_url: string | null;
    }> = [];
    for (const p of collected) {
      if (!p.code || !p.product_name) continue;
      const brand = Array.isArray(p.brands)
        ? p.brands.filter(Boolean).join(", ") || null
        : (p.brands ?? null);
      offResults.push({
        barcode: p.code.replace(/^0+/, "") || p.code,
        name: p.product_name,
        brand,
        image_url: p.image_front_small_url ?? p.image_small_url ?? null,
      });
      if (offResults.length >= wantRemote) break;
    }
    return { local: localResults, remote: offResults };
}

export const searchProducts = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ query: z.string().min(1).max(120) }).parse(input))
  .handler(async ({ data }) => searchProductsCore(data));

// -------- Fetch a single cached product --------
export async function getProductCore(data: { id: string }): Promise<AnalyzedProduct | null> {
    const supabase = serverSupabase();
    const client = supabase as unknown as ReturnType<typeof createClient>;
    const { data: row, error } = await client
      .from("products")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;
    return refreshIfUncertain(row as unknown as AnalyzedProduct);
}

export const getProduct = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => getProductCore(data));


// -------- Ingredient detail --------
export async function getIngredientCore(data: { slug: string }) {
    const supabase = serverSupabase();
    const client = supabase as unknown as ReturnType<typeof createClient>;
    const { data: row, error } = await client
      .from("ingredients")
      .select("*")
      .eq("slug", data.slug)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row as KnownIngredient | null;
}

export const getIngredient = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ slug: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => getIngredientCore(data));

export async function listIngredientsCore() {
  const supabase = serverSupabase();
  const client = supabase as unknown as ReturnType<typeof createClient>;
  const { data, error } = await client
    .from("ingredients")
    .select("slug,name,category,vegan,vegetarian")
    .order("name");
  if (error) throw new Error(error.message);
  return data as Array<{
    slug: string;
    name: string;
    category: string;
    vegan: boolean | null;
    vegetarian: boolean | null;
  }>;
}

export const listIngredients = createServerFn({ method: "GET" }).handler(async () =>
  listIngredientsCore(),
);
