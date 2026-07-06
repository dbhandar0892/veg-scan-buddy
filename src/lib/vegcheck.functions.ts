import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import {
  analyzeText,
  deriveStatusFromHits,
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

async function loadKnownIngredients(): Promise<KnownIngredient[]> {
  const supabase = serverSupabase();
  const { data, error } = await supabase
    .from("ingredients")
    .select("slug,name,aliases,category,vegan,vegetarian,explanation,e_number");
  if (error) throw new Error(error.message);
  return (data ?? []) as KnownIngredient[];
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

  // Step 1: classify brand-new tokens (adds to global DB).
  const unknownTokens = result.hits
    .filter((h) => h.slug === null && h.category === "unknown")
    .map((h) => h.token);
  if (unknownTokens.length > 0) {
    const { learnUnknownIngredients } = await import("./learn.server");
    const learned = await learnUnknownIngredients(unknownTokens);
    if (learned.length > 0) result = analyzeText(text, [...known, ...learned]);
  }

  // Step 2: if any hit is still uncertain, do a web-research pass with the
  // product/brand as context so we can check the manufacturer's own statements.
  if (result.status === "unknown") {
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
      const { researchUncertain } = await import("./learn.server");
      const verdicts = await researchUncertain(uncertain, ctx);
      if (verdicts.length > 0) {
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
          const v = findVerdict(h);
          if (!v) return h;
          const confirmedBy =
            v.sources.length > 0
              ? ` Confirmed by ${v.sources.map((s) => domainOf(s)).filter(Boolean).slice(0, 2).join(", ")}.`
              : "";
          const prefix =
            v.vegan === true || v.vegetarian === true
              ? "Manufacturer doesn't specify, but independent sources confirm this is plant-based. "
              : "";
          return {
            ...h,
            vegan: v.vegan,
            vegetarian: v.vegetarian,
            explanation: `${prefix}${v.explanation}${confirmedBy}`.trim(),
            sources: v.sources.slice(0, 3),
          };
        });
        const manufacturerConfirmed = verdicts.some((v) => v.manufacturer_confirms);
        result = {
          ...deriveStatusFromHits(patched),
          verification: manufacturerConfirmed ? "manufacturer" : "community",
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
export const lookupBarcode = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ barcode: z.string().min(4).max(32) }).parse(input))
  .handler(async ({ data }): Promise<AnalyzedProduct | null> => {
    const supabase = serverSupabase();
    // Check cache first
    const client = supabase as unknown as ReturnType<typeof createClient>;
    const cached = await client
      .from("products")
      .select("*")
      .eq("barcode", data.barcode)
      .maybeSingle();
    if (cached.data) {
      return refreshIfUncertain(cached.data as unknown as AnalyzedProduct);
    }


    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(data.barcode)}.json?fields=product_name,brands,image_front_url,image_url,categories,ingredients_text_en,ingredients_text`,
      { headers: { "User-Agent": "VegCheck/1.0 (contact@vegcheck.app)" } },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      status?: number;
      product?: {
        product_name?: string;
        brands?: string;
        image_front_url?: string;
        image_url?: string;
        categories?: string;
        ingredients_text_en?: string;
        ingredients_text?: string;
      };
    };
    if (json.status !== 1 || !json.product) return null;
    const p = json.product;
    const ingredientsText = (p.ingredients_text_en || p.ingredients_text || "").trim();
    if (!ingredientsText) return null;

    const analysis = await analyzeAndLearn(ingredientsText, {
      brand: p.brands ?? null,
      productName: p.product_name ?? null,
    });
    return upsertProduct(supabase, {
      barcode: data.barcode,
      name: p.product_name || "Unknown Product",
      brand: p.brands ?? null,
      image_url: p.image_front_url ?? p.image_url ?? null,
      category: p.categories ?? null,
      ingredients_text: ingredientsText,
      analysis,
      source: "openfoodfacts",
    });
  });

// -------- Analyze free-text ingredients (from OCR or paste) --------
export const analyzeIngredients = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        text: z.string().min(1).max(8000),
        name: z.string().max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<AnalyzedProduct> => {
    const supabase = serverSupabase();
    const analysis = await analyzeAndLearn(data.text, { productName: data.name ?? null });
    return upsertProduct(supabase, {
      name: data.name || "Scanned Ingredients",
      ingredients_text: data.text,
      analysis,
      source: "ocr",
    });
  });

// -------- Analyze a photo: works for either an ingredient label OR a product shot --------
// The AI first tries to read the ingredient list. If none is visible (e.g. the
// user photographed the front of the package), it identifies the product by
// name/brand so we can look it up in Open Food Facts.
export const ocrIngredients = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        imageBase64: z.string().min(100),
        mime: z.string().default("image/jpeg"),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<AnalyzedProduct> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              'You analyze a photo of a food product. Return ONLY a compact JSON object with these keys: {"ingredients": string|null, "product_name": string|null, "brand": string|null, "barcode": string|null}. ' +
              '"ingredients" = the ingredient list read verbatim from the label as a comma-separated string, or null if not clearly visible. ' +
              '"product_name" = the product name printed on the packaging, or null. ' +
              '"brand" = the brand/manufacturer name, or null. ' +
              '"barcode" = the digits of the barcode if clearly visible, else null. ' +
              "No prose, no code fences, JSON only.",
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
    });
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

    // 1) Barcode visible? Use the reliable Open Food Facts lookup.
    if (barcode && barcode.length >= 8) {
      const viaBarcode = await lookupBarcode({ data: { barcode } });
      if (viaBarcode) return viaBarcode;
    }

    // 2) Ingredient list visible? Analyze it directly.
    if (ingredients && ingredients.length > 3) {
      const supabase = serverSupabase();
      const analysis = await analyzeAndLearn(ingredients, {
        brand: brand || null,
        productName: productName || null,
      });
      return upsertProduct(supabase, {
        name: productName || "Scanned Label",
        brand: brand || null,
        ingredients_text: ingredients,
        analysis,
        source: "ocr",
      });
    }

    // 3) Only front-of-package info? Search Open Food Facts by name+brand.
    const searchTerm = [brand, productName].filter(Boolean).join(" ").trim();
    if (searchTerm) {
      const headers = { "User-Agent": "VegCheck/1.0 (contact@vegcheck.app)" };
      const encoded = encodeURIComponent(searchTerm);
      const candidates: string[] = [];
      const salRes = await fetch(
        `https://search.openfoodfacts.org/search?q=${encoded}&page_size=5&fields=code`,
        { headers },
      ).catch(() => null);
      if (salRes && salRes.ok) {
        try {
          const j = (await salRes.json()) as { hits?: { code?: string }[] };
          for (const h of j.hits ?? []) {
            if (h.code) candidates.push(h.code.replace(/^0+/, "") || h.code);
          }
        } catch {
          // ignore
        }
      }
      if (candidates.length === 0) {
        const v2Res = await fetch(
          `https://world.openfoodfacts.org/api/v2/search?search_terms=${encoded}&page_size=5&fields=code`,
          { headers },
        ).catch(() => null);
        if (v2Res && v2Res.ok) {
          try {
            const j = (await v2Res.json()) as { products?: { code?: string }[] };
            for (const p of j.products ?? []) {
              if (p.code) candidates.push(p.code.replace(/^0+/, "") || p.code);
            }
          } catch {
            // ignore
          }
        }
      }
      for (const code of candidates) {
        try {
          const product = await lookupBarcode({ data: { barcode: code } });
          if (product) return product;
        } catch {
          // try next candidate
        }
      }
      throw new Error(
        `We recognized "${searchTerm}" but couldn't find its ingredient list. Try a photo of the ingredient label.`,
      );
    }

    throw new Error(
      "We couldn't recognize the product or read an ingredient list. Try a clearer, well-lit photo.",
    );
  });


// -------- Search products --------
export const searchProducts = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ query: z.string().min(1).max(120) }).parse(input))
  .handler(async ({ data }) => {
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

    // Query Open Food Facts. Prefer the modern search-a-licious endpoint
    // (much better full-text ranking), and fall back to the legacy v2 and
    // CGI search endpoints. Merge and dedupe by barcode.
    const headers = { "User-Agent": "VegCheck/1.0 (contact@vegcheck.app)" };
    const fields = "code,product_name,brands,image_front_small_url,image_small_url";
    const encoded = encodeURIComponent(q);
    const [salRes, v2Res, cgiRes] = await Promise.all([
      fetch(
        `https://search.openfoodfacts.org/search?q=${encoded}&page_size=20&fields=${fields}`,
        { headers },
      ).catch(() => null),
      fetch(
        `https://world.openfoodfacts.org/api/v2/search?search_terms=${encoded}&page_size=20&fields=${fields}`,
        { headers },
      ).catch(() => null),
      fetch(
        `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encoded}&search_simple=1&action=process&json=1&page_size=20&fields=${fields}`,
        { headers },
      ).catch(() => null),
    ]);

    type OffProduct = {
      code?: string;
      product_name?: string;
      brands?: string | string[];
      image_front_small_url?: string;
      image_small_url?: string;
    };
    const collected: OffProduct[] = [];
    if (salRes && salRes.ok) {
      try {
        const j = (await salRes.json()) as { hits?: OffProduct[] };
        if (j.hits) collected.push(...j.hits);
      } catch {
        // ignore
      }
    }
    for (const res of [v2Res, cgiRes]) {
      if (!res || !res.ok) continue;
      try {
        const j = (await res.json()) as { products?: OffProduct[] };
        if (j.products) collected.push(...j.products);
      } catch {
        // ignore malformed responses
      }
    }
    const seen = new Set<string>();
    const offResults: Array<{
      barcode: string;
      name: string;
      brand: string | null;
      image_url: string | null;
    }> = [];
    for (const p of collected) {
      if (!p.code || !p.product_name) continue;
      // search-a-licious returns barcodes zero-padded to 13 digits. Strip
      // leading zeros so barcode lookups match the OFF product API.
      const barcode = p.code.replace(/^0+/, "") || p.code;
      if (seen.has(barcode)) continue;
      seen.add(barcode);
      const brand = Array.isArray(p.brands)
        ? p.brands.filter(Boolean).join(", ") || null
        : (p.brands ?? null);
      offResults.push({
        barcode,
        name: p.product_name,
        brand,
        image_url: p.image_front_small_url ?? p.image_small_url ?? null,
      });
      if (offResults.length >= 20) break;
    }
    return { local: localResults, remote: offResults };
  });

// -------- Fetch a single cached product --------
export const getProduct = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }): Promise<AnalyzedProduct | null> => {
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
  });


// -------- Ingredient detail --------
export const getIngredient = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ slug: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    const supabase = serverSupabase();
    const client = supabase as unknown as ReturnType<typeof createClient>;
    const { data: row, error } = await client
      .from("ingredients")
      .select("*")
      .eq("slug", data.slug)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row as KnownIngredient | null;
  });

export const listIngredients = createServerFn({ method: "GET" }).handler(async () => {
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
});
