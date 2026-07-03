# VegCheck — Build Plan

A mobile-first PWA that answers one question: *Can I eat this if I'm vegan or vegetarian?*

## Scope for v1

In: barcode scan, ingredient photo (OCR + AI), product search, result screen (Vegan / Vegetarian / Not Vegetarian / Unable to Confirm) with confidence + ingredient breakdown, ingredient detail pages, history, favorites, settings (dark mode, about, feedback link).

Out (per your brief): halal, kosher, allergies, nutrition, carbon, recipes, meal planning, community submissions.

## Design system

- Minimalist, Apple-like. Rounded cards, large typography, generous spacing, subtle shadows.
- Semantic tokens in `src/styles.css` (oklch): green (vegan/ok), red (not vegetarian), amber (unsure), neutral surfaces. Dark mode included.
- Font pair: Geist / Instrument Sans (or similar clean modern sans). No purple.
- Bottom tab nav on mobile: Home · Scan · History · Favorites · Settings.

## Screens / routes

```
/                Home — big Scan CTA, search bar, recent scans
/scan            Camera view: barcode + ingredient photo modes
/result/$id      Result screen (status, confidence, ingredients of interest)
/ingredient/$slug  Ingredient detail
/search          Product search (name / brand / UPC)
/history         Scan history (searchable, deletable)
/favorites       Saved products
/settings        Dark mode, about, privacy, terms, feedback
```

## Backend (Lovable Cloud)

Tables:
- `ingredients` — name, slug, vegan (bool|null), vegetarian (bool|null), category (plant/animal/microbial/mineral/unknown), source, explanation. Seeded with the list you provided (rennet variants, gelatin, carmine, beeswax, shellac, enzymes, natural flavors, milk, whey, casein, honey, lard, tallow, isinglass, L-cysteine, lanolin, cochineal, etc.).
- `products` — barcode (unique), name, brand, image_url, ingredients_text, category, status, confidence, explanation, ingredient_hits (jsonb), last_analyzed_at, verification (enum: unverified/community/manufacturer — future ready but unused in UI).
- `scans` — user_id, product_id (nullable), source (barcode/photo/search), raw_input, status, confidence, created_at.
- `favorites` — user_id, product_id, created_at.
- `profiles` — user_id, display_name, dark_mode.

RLS: scans/favorites/profiles scoped to `auth.uid()`. Ingredients + products readable by `anon` + `authenticated` (public data). Writes to products via server functions only.

Server functions (`createServerFn`):
- `lookupBarcode({ barcode })` — hits Open Food Facts (free, no key). If found, normalizes and analyzes ingredients.
- `analyzeIngredients({ text, productMeta? })` — deterministic pass over `ingredients` table first; anything ambiguous → Lovable AI (gemini-3-flash) with strict JSON schema returning `{status, confidence, explanation, ingredientHits[]}`. Never fabricates: unmatched + non-obvious → "Unable to Confirm".
- `ocrIngredients({ imageBase64 })` — Lovable AI multimodal (gemini-3-flash) to read the label and return cleaned ingredient list, then call `analyzeIngredients`.
- `searchProducts({ query })` — Open Food Facts search + local cache.
- `recordScan`, `toggleFavorite`, `deleteScan`.

Public server route `/api/public/health` for uptime.

## Analysis logic (trust-first)

1. Tokenize ingredients (split on commas, strip parens/percentages, lowercase, strip E-numbers to canonical names via map).
2. Match each token against `ingredients` table (exact + alias table).
3. Determine status:
   - Any confirmed animal ingredient → **Not Vegetarian** (or Not Vegan if only dairy/egg/honey but no meat/gelatin/rennet).
   - Any dairy/egg/honey but no meat-origin → **Vegetarian, not Vegan**.
   - All matched + all plant/microbial/mineral → **Vegan**.
   - Any `unknown`-category ingredient (enzymes, natural flavors, mono/diglycerides, lecithin without source) or unmatched suspicious token → **Unable to Confirm**.
4. Confidence = share of tokens confidently classified, penalized by unknowns.
5. AI only used to (a) explain in ≤20 plain words and (b) resolve ambiguity when local DB is silent — never to override a confident local classification.

## Result screen

Big status pill (color-coded), one-sentence explanation, confidence %, "Ingredients of interest" list with plant/animal/microbial/unknown badges → tap for detail page.

## PWA

Manifest-only (installable, home-screen). No service worker — per PWA skill default, since you didn't ask for offline.

## Tech notes

- TanStack Start template (already scaffolded). Add Lovable Cloud, seed migration for ingredients, server functions per above.
- Barcode scan uses `@zxing/browser` on-device (no key needed).
- Camera + OCR happen client-side capture → base64 → server fn → Lovable AI.

## Build order

1. Enable Lovable Cloud; migrations + ingredient seed.
2. Design system + shell (bottom nav, routes, dark mode toggle).
3. Home + search + history + favorites (data plumbing).
4. Analyze pipeline + result + ingredient detail pages.
5. Barcode scanner + OCR scanner.
6. PWA manifest, SEO/head, sitemap/robots, llms.txt.

## One question before I start

Auth: require sign-in from day one (so history/favorites work across devices), or keep v1 fully anonymous with local-only history + a "Sign in to sync" prompt later? Anonymous-first is faster to the "3 seconds to answer" feel; sign-in-first is cleaner data. I'll default to **anonymous-first with Lovable Cloud auth optional** unless you say otherwise.