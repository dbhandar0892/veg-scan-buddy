// Store-name matching shared by the retailer check and store-specific search.
// Matching is strict: a product counts only when an Open Food Facts store entry
// equals one of the store's known names (or starts with one, e.g.
// "Walmart Supercenter"). No loose substring matching, so "Giant" never
// matches "Giant Eagle" and "Aldi" never matches "Rinaldi's".

export function normStore(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "");
}

// Canonical store -> names it is listed under in Open Food Facts.
const ALIASES: Record<string, string[]> = {
  walmart: ["walmart", "walmartsupercenter", "walmartneighborhoodmarket"],
  target: ["target", "supertarget"],
  wholefoodsmarket: ["wholefoods", "wholefoodsmarket", "wholefoodsmarketinc"],
  shoprite: ["shoprite"],
  stopshop: ["stopshop", "stopandshop"],
  kroger: ["kroger"],
  publix: ["publix"],
  wegmans: ["wegmans"],
  traderjoes: ["traderjoes", "traderjoe", "traderjoesinc"],
  costco: ["costco", "costcowholesale", "kirkland"],
  aldi: ["aldi", "aldius"],
  bjswholesaleclub: ["bjs", "bjswholesale", "bjswholesaleclub", "bj"],
  samsclub: ["samsclub", "sams"],
  safeway: ["safeway"],
  albertsons: ["albertsons"],
  heb: ["heb", "hebgrocery"],
  meijer: ["meijer"],
  foodlion: ["foodlion"],
  giant: ["giant", "giantfood", "giantfoodstores"],
  hannaford: ["hannaford"],
  sprouts: ["sprouts", "sproutsfarmersmarket"],
  lidl: ["lidl", "lidlus"],
};

/** All normalized names this store may be listed under. */
export function storeKeys(store: string): string[] {
  const n = normStore(store);
  for (const [canon, list] of Object.entries(ALIASES)) {
    if (canon === n || list.includes(n)) return [...new Set([canon, ...list])];
  }
  return [n];
}

/** Open Food Facts store tag slugs to search by (e.g. "bj-s", "whole-foods"). */
export function storeTagSlugs(store: string): string[] {
  const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const extra: Record<string, string[]> = {
    bjswholesaleclub: ["bj-s", "bjs", "bj-s-wholesale-club"],
    traderjoes: ["trader-joe-s", "trader-joes"],
    wholefoodsmarket: ["whole-foods", "whole-foods-market"],
    samsclub: ["sam-s-club", "sams-club"],
    stopshop: ["stop-shop", "stop-and-shop"],
    heb: ["heb", "h-e-b"],
  };
  const keys = storeKeys(store);
  const canon = keys[0]!;
  return [...new Set([slug(store), ...(extra[canon] ?? []), ...keys.filter((k) => k.length > 3)])].slice(0, 4);
}

/** True when any listed store name matches the chosen store. */
export function storeListed(listed: string[], store: string): boolean {
  const keys = storeKeys(store);
  return listed
    .map((s) => normStore(s.replace(/^[a-z]{2}:/, "")))
    .filter(Boolean)
    .some((n) => keys.some((k) => n === k || (k.length >= 4 && n.startsWith(k) && !isOtherChain(n, k))));
}

// Chains whose names start with another chain's name.
function isOtherChain(n: string, k: string): boolean {
  return (k === "giant" && n.startsWith("gianteagle")) || (k === "target" && n.startsWith("targetaustralia"));
}
