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
  e_number: string | null;
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
  // Extract E-numbers hidden inside parentheses (e.g. "colour (120)", "raising
  // agents (500, 503)") and promote them into standalone tokens BEFORE we
  // strip parens — otherwise "colour (120)" collapses to just "colour" and we
  // lose the fact that E120 (cochineal/carmine) is insect-derived.
  const promoted: string[] = [];
  const withPromoted = text.replace(/\(([^)]*)\)/g, (_, inner: string) => {
    const nums = inner.match(/\b[eE]?\s?-?\s?\d{3}[a-zA-Z]?\b/g);
    if (nums) for (const n of nums) promoted.push("e" + n.replace(/[^0-9a-zA-Z]/g, "").replace(/^e/i, ""));
    return " ";
  });
  const cleaned = (withPromoted + (promoted.length ? ", " + promoted.join(", ") : ""))
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

// Commonly ambiguous ingredients that are, in general practice, plant-based
// or microbial. When the manufacturer doesn't specify the source, don't block
// classification — treat optimistically and append a transparency note.
// Values: "vegan" = usually plant-based (e.g. sugar, natural flavors);
//         "vegetarian" = usually not meat-derived but vegan status unclear
//         (e.g. mono/diglycerides, glycerin, vitamin D3, stearic acid).
type AmbiguousDefault = "vegan" | "vegetarian";
const AMBIGUOUS_DEFAULTS: { patterns: RegExp; kind: AmbiguousDefault; label: string }[] = [
  { patterns: /\b(sugar|cane sugar|sugars)\b/i, kind: "vegan", label: "sugar" },
  { patterns: /\bnatural (and artificial )?flavou?rs?\b/i, kind: "vegetarian", label: "natural flavors" },
  { patterns: /\bartificial flavou?rs?\b/i, kind: "vegan", label: "artificial flavors" },
  { patterns: /\benzymes?\b/i, kind: "vegetarian", label: "enzymes" },
  { patterns: /\bmono[-\s]?and[-\s]?diglycerides?\b|\bmono[-\s]?diglycerides?\b|\bdiglycerides?\b/i, kind: "vegetarian", label: "mono- and diglycerides" },
  { patterns: /\bglycerin(e)?\b|\bglycerol\b/i, kind: "vegetarian", label: "glycerin" },
  { patterns: /\bvitamin\s?d3\b|\bcholecalciferol\b/i, kind: "vegetarian", label: "vitamin D3" },
  { patterns: /\bstearic acid\b/i, kind: "vegetarian", label: "stearic acid" },
  { patterns: /\bmagnesium stearate\b/i, kind: "vegetarian", label: "magnesium stearate" },
  { patterns: /\blecithin\b/i, kind: "vegan", label: "lecithin" },
];

function ambiguousDefaultFor(h: IngredientHit): { kind: AmbiguousDefault; label: string } | null {
  const hay = `${h.name} ${h.token}`;
  for (const rule of AMBIGUOUS_DEFAULTS) if (rule.patterns.test(hay)) return { kind: rule.kind, label: rule.label };
  return null;
}

// Generic label words ("colour", "flavouring", "emulsifier") are not animal
// ingredients by themselves — only the specific substance behind them is.
// Phrase verdicts accordingly so we never imply "colour = not vegetarian".
const GENERIC_CATEGORIES: { pattern: RegExp; label: string }[] = [
  { pattern: /\bcolou?rs?\b|\bcolou?ring\b/i, label: "colour" },
  { pattern: /\bflavou?rs?\b|\bflavou?ring\b/i, label: "flavouring" },
  { pattern: /\bemulsifiers?\b/i, label: "emulsifier" },
  { pattern: /\benzymes?\b/i, label: "enzyme" },
  { pattern: /\bstabili[sz]ers?\b/i, label: "stabiliser" },
  { pattern: /\bthickeners?\b/i, label: "thickener" },
  { pattern: /\bgelling agents?\b/i, label: "gelling agent" },
  { pattern: /\banti[-\s]?caking agents?\b/i, label: "anti-caking agent" },
  { pattern: /\bglazing agents?\b|\bglaze\b/i, label: "glazing agent" },
  { pattern: /\badditives?\b/i, label: "additive" },
  { pattern: /\bshortening\b/i, label: "shortening" },
];

function genericCategoryOf(name: string): string | null {
  // Only treat as generic if the name is essentially just the category word.
  const n = name.trim();
  if (n.split(/\s+/).length > 3) return null;
  for (const g of GENERIC_CATEGORIES) if (g.pattern.test(n)) return g.label;
  return null;
}

// Named animal-derived substances we can surface behind a generic label.
const SPECIFIC_SUBSTANCES = [
  "cochineal",
  "carmine",
  "carminic acid",
  "shellac",
  "gelatin",
  "gelatine",
  "isinglass",
  "lard",
  "tallow",
  "rennet",
  "beeswax",
  "lanolin",
  "l-cysteine",
  "castoreum",
  "ambergris",
  "bone char",
  "bone phosphate",
  "squalene",
  "cod liver oil",
  "fish oil",
  "collagen",
  "keratin",
  "pepsin",
  "civet",
  "musk",
  "cuttlefish ink",
  "squid ink",
  "chitosan",
  "propolis",
  "royal jelly",
  "silk",
  "spermaceti",
  "suet",
  "elastin",
];

function specificSubstanceFrom(detail: string): string | null {
  const d = detail.toLowerCase();
  for (const s of SPECIFIC_SUBSTANCES) if (d.includes(s)) return s;
  return null;
}

const SPECIFIC_DESCRIPTORS: Record<string, string> = {
  cochineal: "a red color made from insects",
  carmine: "a red color made from insects",
  "carminic acid": "a red color made from insects",
  shellac: "a resin from insects",
  gelatin: "made from animal collagen",
  gelatine: "made from animal collagen",
  isinglass: "from fish bladders",
  lard: "animal fat",
  tallow: "animal fat",
  rennet: "from animal stomachs",
  beeswax: "from bees",
  lanolin: "from sheep wool",
  "l-cysteine": "often from feathers or hair",
  castoreum: "from beavers",
  ambergris: "from whales",
  "bone char": "a filter made from animal bones",
  "bone phosphate": "made from animal bones",
  squalene: "often from shark liver oil",
  "cod liver oil": "from fish",
  "fish oil": "from fish",
  collagen: "from animal skin and bones",
  keratin: "from hooves, horns, or feathers",
  pepsin: "an enzyme from pig stomachs",
  civet: "from civet cats",
  musk: "from animal glands",
  "cuttlefish ink": "from cuttlefish",
  "squid ink": "from squid",
  chitosan: "from shellfish shells",
  propolis: "from bees",
  "royal jelly": "from bees",
  silk: "from silkworms",
  spermaceti: "from whales",
  suet: "animal fat",
  elastin: "from animal connective tissue",
};


function cleanDetail(raw: string | undefined): string {
  const detail = (raw || "").trim();
  if (!detail || /^not in our ingredient database/i.test(detail)) return "";
  return detail.replace(/\s+/g, " ").replace(/\.?$/, ".");
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function deriveStatusFromHits(hits: IngredientHit[]): AnalysisResult {

  let matched = 0;
  let unknownCount = 0;
  let hasAnimalNonDairy = false;
  let hasDairyEggHoney = false;
  let hasUnknownVegetarian = false; // vegetarian status itself is unclear
  let hasUnknownVeganOnly = false; // vegetarian confirmed, but vegan unclear
  const unverifiedNotes: string[] = [];

  for (const h of hits) {
    // Absorb known-ambiguous items into an optimistic default with a note,
    // rather than letting them force an "Unable to Confirm" verdict.
    if (h.vegetarian === null || (h.slug === null && h.category === "unknown")) {
      const def = ambiguousDefaultFor(h);
      if (def) {
        matched++;
        if (def.kind === "vegan") hasUnknownVeganOnly ||= false; // stays vegan-eligible
        else hasUnknownVeganOnly = true; // vegetarian-safe but vegan unclear
        unverifiedNotes.push(
          `Contains ${def.label} from an unspecified source.`
        );
        continue;
      }
    }
    if (h.slug === null && h.category === "unknown" && h.vegan === null && h.vegetarian === null) {
      unknownCount++;
      continue;
    }
    matched++;
    if (h.vegetarian === false) hasAnimalNonDairy = true;
    else if (h.vegan === false && h.vegetarian === true) hasDairyEggHoney = true;
    else if (h.vegetarian === null) hasUnknownVegetarian = true;
    else if (h.vegan === null) hasUnknownVeganOnly = true;
  }

  // Fully unmatched tokens block vegetarian determination too.
  if (unknownCount > 0) hasUnknownVegetarian = true;

  const totalConsidered = matched + unknownCount;
  const knownRatio = totalConsidered === 0 ? 0 : matched / totalConsidered;

  let status: Status;
  let explanation: string;
  if (hasAnimalNonDairy) {
    status = "not_vegetarian";
    const offenders = hits.filter((h) => h.vegetarian === false);
    // Prefer a specifically-named offender ("cochineal") over a generic label
    // ("colour") so the message says what the actual problem ingredient is.
    const culprit =
      offenders.find((h) => !genericCategoryOf(h.name)) ?? offenders[0];
    if (culprit) {
      const name = culprit.name.toLowerCase();
      const detail = cleanDetail(culprit.explanation);
      const generic = genericCategoryOf(name);
      const eNum =
        culprit.e_number ??
        offenders.find((h) => h.e_number)?.e_number ??
        null;
      const specific =
        specificSubstanceFrom(name) ??
        specificSubstanceFrom(detail) ??
        specificSubstanceFrom(offenders.map((h) => `${h.name} ${h.explanation}`).join(" "));
      // Short, consistent style: "Contains <substance> (E###), <why>. Not vegan or vegetarian."
      const shortWhy = (d: string) =>
        d
          .replace(/^(a |an |the )/i, "")
          .replace(/\bnot vegan( or vegetarian)?\.?/gi, "")
          .replace(/\s+/g, " ")
          .trim()
          .replace(/\.$/, "")
          .toLowerCase();
      if (specific) {
        const descriptor = SPECIFIC_DESCRIPTORS[specific.toLowerCase()] ?? "animal-derived";
        explanation = `Contains ${specific}${eNum ? ` (${eNum.toUpperCase()})` : ""}, ${descriptor}. Not vegan or vegetarian.`;
      } else if (!generic) {
        const why = shortWhy(detail);
        explanation = why
          ? `Contains ${name}${eNum ? ` (${eNum.toUpperCase()})` : ""}, ${why}. Not vegan or vegetarian.`
          : `Contains ${name}${eNum ? ` (${eNum.toUpperCase()})` : ""}, an animal-derived ingredient. Not vegan or vegetarian.`;
      } else {
        explanation = `The ${generic}${eNum ? ` (${eNum.toUpperCase()})` : ""} used is animal-derived. Not vegan or vegetarian.`;
      }

    } else {
      explanation = "Contains an animal-derived ingredient.";
    }


  } else if (hasUnknownVegetarian && !hasDairyEggHoney) {
    status = "unknown";
    const uh =
      hits.find((h) => h.vegetarian === null && h.vegan === null && !ambiguousDefaultFor(h)) ??
      hits.find((h) => h.vegetarian === null && !ambiguousDefaultFor(h));
    if (uh) {
      const name = uh.name.toLowerCase();
      const rawDetail = (uh.explanation || "").trim();
      const contradicts = /\b(is|are)\s+(vegetarian|vegan)\b|\bplant[-\s]?based\b|\bconfirm(s|ed)?\b/i.test(rawDetail);
      const usableDetail = rawDetail && rawDetail !== "Not in our ingredient database yet." && !contradicts
        ? rawDetail
        : "Its source isn't confirmed.";
      explanation = `"${name}" needs a closer look — ${usableDetail}`;
    } else {
      explanation = "Some ingredients couldn't be confirmed against the manufacturer's listing.";
    }

  } else if (hasDairyEggHoney) {
    status = "vegetarian";
    const culprits = hits.filter((h) => h.vegan === false && h.vegetarian === true);
    const kinds = new Set<string>();
    for (const c of culprits) {
      const n = c.name.toLowerCase();
      const slug = (c.slug ?? "").toLowerCase();
      if (slug.includes("honey") || n.includes("honey")) kinds.add("honey");
      else if (slug.includes("egg") || n.includes("egg") || n.includes("albumen")) kinds.add("egg");
      else kinds.add("dairy");
    }
    const label =
      kinds.size === 0
        ? "dairy, egg, or honey"
        : Array.from(kinds).join(kinds.size === 2 ? " and " : ", ");
    explanation = `Contains ${label} but no meat or animal rennet.`;
  } else if (hasUnknownVeganOnly) {
    status = "vegetarian";
    explanation = "Vegetarian confirmed; a few items couldn't be verified as vegan.";
  } else if (matched > 0) {
    status = "vegan";
    explanation = "No animal-derived ingredients were detected.";
  } else {
    status = "unknown";
    explanation = "No ingredients could be identified.";
  }

  // Append transparency notes about ambiguous items we couldn't verify.
  if (unverifiedNotes.length > 0 && (status === "vegan" || status === "vegetarian")) {
    explanation = `${explanation} ${unverifiedNotes.slice(0, 3).join(" ")}`.trim();
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
        e_number: null,
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
      e_number: ing.e_number,
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
