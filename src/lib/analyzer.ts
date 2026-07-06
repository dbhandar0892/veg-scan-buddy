// Deterministic ingredient tokenizer + classifier.
// Trust-first: never guesses. Anything ambiguous → "unknown".

export type Status = "vegan" | "vegetarian" | "not_vegetarian" | "unknown";
export type IngredientCategory =
  | "plant"
  | "animal"
  | "microbial"
  | "mineral"
  | "synthetic"
  | "unknown";

export interface KnownIngredient {
  slug: string;
  name: string;
  aliases: string[];
  category: IngredientCategory;
  vegan: boolean | null;
  vegetarian: boolean | null;
  source?: string | null;
  explanation: string;
  e_number: string | null;
}

export interface IngredientHit {
  token: string;
  slug: string | null;
  name: string;
  category: IngredientCategory;
  vegan: boolean | null;
  vegetarian: boolean | null;
  explanation: string;
  sources?: string[];
}

export interface AnalysisResult {
  status: Status;
  confidence: number; // 0-1
  explanation: string;
  hits: IngredientHit[];
  verification?: "unverified" | "community" | "manufacturer";
}

const STOPWORDS = new Set([
  "and",
  "or",
  "of",
  "from",
  "with",
  "contains",
  "may",
  "less",
  "than",
  "the",
  "a",
  "an",
  "including",
  "including:",
]);

export function tokenizeIngredients(text: string): string[] {
  if (!text) return [];
  // Remove parenthetical percentages and stray punctuation
  const cleaned = text
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\d+(\.\d+)?\s*%/g, " ")
    .replace(/\*/g, " ")
    .replace(/\.$/, "")
    .toLowerCase();
  return cleaned
    .split(/,|;|\||•|·/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !STOPWORDS.has(s));
}

function buildLookup(known: KnownIngredient[]) {
  const byName = new Map<string, KnownIngredient>();
  const byE = new Map<string, KnownIngredient>();
  for (const ing of known) {
    byName.set(ing.name.toLowerCase(), ing);
    for (const a of ing.aliases) byName.set(a.toLowerCase(), ing);
    if (ing.e_number) byE.set(ing.e_number.toLowerCase(), ing);
  }
  return { byName, byE };
}

function matchToken(
  token: string,
  byName: Map<string, KnownIngredient>,
  byE: Map<string, KnownIngredient>,
): KnownIngredient | null {
  const t = token.trim().toLowerCase();
  if (!t) return null;
  if (byName.has(t)) return byName.get(t)!;
  const eMatch = t.match(/\be\s?-?\s?(\d{3}[a-z]?)\b/);
  if (eMatch) {
    const key = ("e" + eMatch[1]).toLowerCase();
    if (byE.has(key)) return byE.get(key)!;
  }
  // Word-boundary substring match against known names (longest wins)
  let best: KnownIngredient | null = null;
  let bestLen = 0;
  for (const [key, ing] of byName) {
    if (key.length < 4) continue;
    if (t === key || t.includes(key)) {
      if (key.length > bestLen) {
        best = ing;
        bestLen = key.length;
      }
    }
  }
  return best;
}

export function deriveStatusFromHits(hits: IngredientHit[]): AnalysisResult {
  let matched = 0;
  let unknownCount = 0;
  let hasAnimalNonDairy = false;
  let hasDairyEggHoney = false;
  let hasUnknownIng = false;

  for (const h of hits) {
    if (h.slug === null && h.category === "unknown" && h.vegan === null && h.vegetarian === null) {
      unknownCount++;
      continue;
    }
    matched++;
    if (h.vegetarian === false) hasAnimalNonDairy = true;
    else if (h.vegan === false && h.vegetarian === true) hasDairyEggHoney = true;
    else if (h.vegan === null || h.vegetarian === null) hasUnknownIng = true;
  }

  const totalConsidered = matched + unknownCount;
  const knownRatio = totalConsidered === 0 ? 0 : matched / totalConsidered;

  let status: Status;
  let explanation: string;
  if (hasAnimalNonDairy) {
    status = "not_vegetarian";
    const culprit = hits.find((h) => h.vegetarian === false);
    explanation = culprit ? `Contains ${culprit.name.toLowerCase()}.` : "Contains an animal ingredient.";
  } else if (hasUnknownIng || unknownCount > 0) {
    status = "unknown";
    const uh = hits.find((h) => h.category === "unknown" || h.vegan === null);
    explanation = uh
      ? `Contains ${uh.name.toLowerCase()} which can be animal or plant.`
      : "Some ingredients could not be confirmed.";
  } else if (hasDairyEggHoney) {
    status = "vegetarian";
    const culprit = hits.find((h) => h.vegan === false && h.vegetarian === true);
    explanation = culprit
      ? `Contains ${culprit.name.toLowerCase()} but no meat or animal rennet.`
      : "Contains dairy, egg, or honey but no other animal ingredients.";
  } else if (matched > 0) {
    status = "vegan";
    explanation = "No animal-derived ingredients were detected.";
  } else {
    status = "unknown";
    explanation = "No ingredients could be identified.";
  }

  let confidence = knownRatio;
  if (status === "unknown") confidence = Math.min(confidence, 0.55);
  if (status === "vegan" && unknownCount === 0 && matched >= 3) confidence = Math.max(confidence, 0.95);
  if (status === "not_vegetarian") confidence = Math.max(confidence, 0.9);
  if (status === "vegetarian" && unknownCount === 0) confidence = Math.max(confidence, 0.88);
  confidence = Math.max(0, Math.min(1, confidence));
  return { status, confidence, explanation, hits };
}

export function analyzeText(
  text: string,
  known: KnownIngredient[],
): AnalysisResult {
  const tokens = tokenizeIngredients(text);
  const { byName, byE } = buildLookup(known);

  const hits: IngredientHit[] = [];
  for (const token of tokens) {
    const ing = matchToken(token, byName, byE);
    if (!ing) {
      if (token.length > 3) {
        hits.push({
          token,
          slug: null,
          name: token,
          category: "unknown",
          vegan: null,
          vegetarian: null,
          explanation: "Not in our ingredient database yet.",
        });
      }
      continue;
    }
    hits.push({
      token,
      slug: ing.slug,
      name: ing.name,
      category: ing.category,
      vegan: ing.vegan,
      vegetarian: ing.vegetarian,
      explanation: ing.explanation,
    });
  }
  return deriveStatusFromHits(hits);
}

export const STATUS_META: Record<
  Status,
  { label: string; emoji: string; tone: "vegan" | "warn" | "danger" | "vegan" }
> = {
  vegan: { label: "Vegan", emoji: "🟢", tone: "vegan" },
  vegetarian: { label: "Vegetarian", emoji: "🟢", tone: "vegan" },
  not_vegetarian: { label: "Not Vegetarian", emoji: "🔴", tone: "danger" },
  unknown: { label: "Unable to Confirm", emoji: "🟡", tone: "warn" },
};
