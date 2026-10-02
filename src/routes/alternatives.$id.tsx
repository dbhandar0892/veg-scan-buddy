import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useId, useState } from "react";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Heart, Info, Leaf, List, Loader2, Sparkles, X } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/Status";
import { StorePicker } from "@/components/StorePicker";
import {
  discoverAlternativeCandidates,
  getProduct,
  verifyAlternativeCandidate,
  type AlternativeResult,
  type AlternativesResponse,
} from "@/lib/vegseal.functions";

function meetsPref(status: string, pref: DietPreference) {
  return pref === "vegan" ? status === "vegan" : status === "vegan" || status === "vegetarian";
}
import {
  getDietPreference,
  getShoppingStore,
  isFavorite,
  setShoppingStore,
  setDietPreference,
  toggleFavorite,
  type DietPreference,
} from "@/lib/local-store";

const productQuery = (id: string) =>
  queryOptions({ queryKey: ["product", id], queryFn: () => getProduct({ data: { id } }) });

export const Route = createFileRoute("/alternatives/$id")({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(productQuery(params.id)),
  head: () => ({
    meta: [
      { title: "Find Alternatives — VegSeal" },
      { name: "description", content: "Find similar products verified to match your vegan or vegetarian preference." },
      { property: "og:title", content: "Find Alternatives — VegSeal" },
      { property: "og:description", content: "Similar products, independently verified as vegan or vegetarian." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AlternativesPage,
});

const PRIORITIES = ["Similar product", "Similar flavor", "Similar price", "Healthier option", "Fewer ingredients"];
const STEPS = ["Finding similar products", "Reading ingredient lists", "Checking every ingredient", "Verifying with trusted sources"];

function AlternativesPage() {
  const { id } = Route.useParams();
  const { data: original } = useSuspenseQuery(productQuery(id));
  const discover = useServerFn(discoverAlternativeCandidates);
  const verify = useServerFn(verifyAlternativeCandidate);
  const [checking, setChecking] = useState(false);
  const [pref, setPref] = useState<DietPreference>("vegan");
  const [priorities, setPriorities] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AlternativesResponse | null>(null);
  const [showHow, setShowHow] = useState(false);
  const [store, setStore] = useState<string | null>(null);
  useEffect(() => {
    setPref(getDietPreference());
    setStore(getShoppingStore());
  }, []);
  useEffect(() => {
    if (!loading) {
      setStep(0);
      return;
    }
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 7000);
    return () => clearInterval(t);
  }, [loading]);
  const changeStore = (s: string | null) => {
    setStore(s);
    setShoppingStore(s);
  };

  if (!original) {
    return (
      <AppShell>
        <PageHeader back title="Find Alternatives" />
        <p className="px-5 text-sm text-muted-foreground">This product isn't in our records anymore.</p>
      </AppShell>
    );
  }

  const prefLabel = pref === "vegan" ? "Vegan" : "Vegetarian";

  const search = async () => {
    setLoading(true);
    setChecking(false);
    setError(null);
    setResult(null);
    try {
      // The selected store is shopping context only; it never changes results.
      const { intent, candidates } = await discover({
        data: { id, preference: pref, priorities, note: note || undefined },
      });
      const found: Array<{ i: number; alt: AlternativeResult }> = [];
      const seen = new Set<string>([id]);
      const publish = () =>
        setResult({
          intent,
          verified: [...found].sort((a, b) => a.i - b.i).map((f) => f.alt),
          unverified: [],
          storeBarcodes: [],
        });
      publish();
      setLoading(false);
      setChecking(true);
      // Check every candidate at once; show each one the moment it passes.
      await Promise.all(
        candidates.map(async (c, i) => {
          const product = await verify({ data: { name: c.name, brand: c.brand } }).catch(() => null);
          if (!product || seen.has(product.id) || !meetsPref(product.status, pref)) return;
          seen.add(product.id);
          found.push({ i, alt: { product, why_similar: c.why_similar } });
          publish();
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
      setChecking(false);
    }
  };

  const toggle = (p: string) =>
    setPriorities((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));

  const [best, ...others] = result?.verified ?? [];

  return (
    <AppShell>
      <PageHeader back title="Find Vegan/Vegetarian Alternatives" />
      <div className="space-y-6 px-5 pb-10">
        <div className="-mt-2 flex justify-center">
          <p className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3.5 py-1.5 text-center text-[13px] font-semibold text-foreground">
            <Info className="size-3.5 shrink-0 text-primary" />
            Availability may vary by location and inventory.
          </p>
        </div>

        <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-soft">
          <div className="h-1.5 w-full bg-gradient-to-r from-primary/70 via-primary to-primary/70" />
          <div className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Similar to</p>
            <div className="mt-2.5 flex items-center gap-3">
              <div className="size-14 shrink-0 overflow-hidden rounded-2xl bg-muted ring-1 ring-border">
                {original.image_url ? <img src={original.image_url} alt="" className="size-full object-cover" /> : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-foreground">{original.name}</p>
                {original.brand ? <p className="truncate text-sm text-muted-foreground">{original.brand}</p> : null}
              </div>
              <StatusPill status={original.status} size="sm" />
            </div>
          </div>
        </div>

        <StorePicker store={store} onChange={changeStore} />

        {!result && !loading ? (
          <>
            <section>
              <h2 className="mb-2.5 text-sm font-semibold text-foreground">My preference</h2>
              <div className="grid grid-cols-2 gap-1 rounded-2xl border border-border bg-muted/60 p-1">
                {(["vegan", "vegetarian"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => {
                      setPref(p);
                      setDietPreference(p);
                    }}
                    className={[
                      "flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-medium capitalize transition-all duration-200 active:scale-[0.97]",
                      pref === p
                        ? "bg-card text-foreground shadow-soft ring-1 ring-primary/40"
                        : "text-muted-foreground",
                    ].join(" ")}
                  >
                    {pref === p ? <Check className="size-4 text-primary" /> : null}
                    {p}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h2 className="mb-2.5 text-sm font-semibold text-foreground">What matters most? <span className="font-normal text-muted-foreground">(optional)</span></h2>
              <div className="flex flex-wrap gap-2">
                {PRIORITIES.map((p) => {
                  const active = priorities.includes(p);
                  return (
                    <button
                      key={p}
                      onClick={() => toggle(p)}
                      className={[
                        "flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm transition-all duration-200 active:scale-95",
                        active
                          ? "border-primary bg-primary text-primary-foreground shadow-soft"
                          : "border-border bg-card text-foreground",
                      ].join(" ")}
                    >
                      {active ? <Check className="size-3.5" /> : null}
                      {p}
                    </button>
                  );
                })}
              </div>
            </section>

            <section>
              <label htmlFor="alt-note" className="mb-2.5 block text-sm font-semibold text-foreground">
                Anything else you want? <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <input
                id="alt-note"
                value={note}
                maxLength={300}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. something similar but spicy"
                className="w-full rounded-2xl border border-border bg-card px-4 py-3.5 text-sm text-foreground shadow-soft outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </section>

            {error ? <p className="text-sm text-danger">{error}</p> : null}

            <button
              onClick={search}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-4 font-semibold text-primary-foreground shadow-soft transition-all duration-200 active:scale-[0.98]"
            >
              <Leaf className="size-5" /> Find Vegan/Vegetarian Alternatives
            </button>
          </>
        ) : null}

        {loading ? (
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center gap-3">
              <div className="relative flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <span className="absolute inset-0 animate-ping rounded-full bg-primary/15" />
                <Sparkles className="relative size-5 animate-pulse text-primary" />
              </div>
              <div>
                <p className="font-medium text-foreground">Finding alternatives…</p>
                <p className="text-sm text-muted-foreground">Matches start appearing in a few seconds.</p>
              </div>
            </div>
            <div className="relative mt-5 h-2 overflow-hidden rounded-full bg-muted">
              <div className="alt-progress h-full rounded-full bg-primary" />
              <div className="alt-sheen absolute inset-y-0 left-0 w-1/4 rounded-full bg-foreground/10 blur-sm" />
            </div>
            <ul className="mt-5 space-y-2.5">
              {STEPS.map((label, i) => (
                <li
                  key={label}
                  className={[
                    "flex items-center gap-2.5 text-sm transition-colors duration-500",
                    i <= step ? "text-foreground" : "text-muted-foreground/50",
                  ].join(" ")}
                >
                  {i < step ? (
                    <Check className="size-4 shrink-0 text-primary" />
                  ) : i === step ? (
                    <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
                  ) : (
                    <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                  )}
                  {label}
                  {i === step ? "…" : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {result ? (
          <>
            {result.intent ? (
              <p className="text-sm text-muted-foreground">Looking for: <span className="text-foreground">{result.intent}</span></p>
            ) : null}

            {best ? (
              <section>
                <h2 className="mb-2 font-display text-2xl text-foreground">{prefLabel} Alternatives</h2>
                <p className="mb-3 text-xs text-muted-foreground">Best match — closest to what you scanned and what you asked for.</p>
                <AltCard alt={best} pref={pref} featured originalName={original.name} originalExplanation={original.explanation} />
              </section>
            ) : checking ? (
              <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-5">
                <Loader2 className="size-5 shrink-0 animate-spin text-primary" />
                <div>
                  <p className="font-medium text-foreground">Checking ingredients…</p>
                  <p className="text-sm text-muted-foreground">Verified matches appear here as soon as each one passes.</p>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-border bg-card p-5 text-center">
                <p className="font-medium text-foreground">We couldn't find a verified match yet.</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  We found similar products, but we couldn't confidently verify their ingredients for your preference.
                </p>
                <div className="mt-4 flex justify-center gap-2">
                  <Link to="/scan" className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
                    Scan another product
                  </Link>
                  <button onClick={() => setResult(null)} className="rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground">
                    Search again
                  </button>
                </div>
              </div>
            )}

            {others.length ? (
              <section>
                <h2 className="mb-3 text-lg font-semibold text-foreground">More Options</h2>
                <div className="space-y-3">
                  {others.map((a) => (
                    <AltCard key={a.product.id} alt={a} pref={pref} />
                  ))}
                </div>
              </section>
            ) : null}

            {checking && best ? (
              <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin text-primary" /> Checking more options…
              </p>
            ) : null}

            <button onClick={() => setShowHow((s) => !s)} className="mx-auto flex items-center gap-1.5 text-xs font-medium text-primary">
              <Info className="size-3.5" /> How VegSeal chose this
            </button>
            {showHow ? (
              <p className="rounded-2xl bg-muted p-4 text-xs leading-relaxed text-muted-foreground">
                VegSeal looked for products similar to the one you scanned and then independently checked their ingredients against your dietary preference. Similarity alone does not determine whether a product is Vegan or Vegetarian. No brand pays for placement.
              </p>
            ) : null}

            {best ? (
              <button onClick={() => setResult(null)} className="w-full rounded-2xl border border-border py-3 text-sm font-medium text-foreground">
                Refine search
              </button>
            ) : null}
          </>
        ) : null}
      </div>
    </AppShell>
  );
}

function AltCard({
  alt,
  pref,
  featured,
  originalName,
  originalExplanation,

}: {

  alt: AlternativeResult;
  pref: DietPreference;
  featured?: boolean;
  originalName?: string;
  originalExplanation?: string;
}) {
  const p = alt.product;
  const ingredientsId = useId();
  const [saved, setSaved] = useState(false);
  const [showIngredients, setShowIngredients] = useState(false);
  useEffect(() => setSaved(isFavorite(p.id)), [p.id]);
  const verifiedLabel = p.status === "vegan" ? "Vegan" : "Vegetarian";
  return (
    <div className={["rounded-2xl border bg-card p-4", featured ? "border-primary shadow-soft" : "border-border"].join(" ")}>
      <Link to="/result/$id" params={{ id: p.id }} className="flex items-center gap-3">
        <div className="size-14 shrink-0 overflow-hidden rounded-xl bg-muted">
          {p.image_url ? <img src={p.image_url} alt="" className="size-full object-cover" /> : null}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-foreground">{p.name}</p>
          {p.brand ? <p className="truncate text-sm text-muted-foreground">{p.brand}</p> : null}
          <div className="mt-1"><StatusPill status={p.status} size="sm" /></div>
        </div>
      </Link>
      {pref === "vegetarian" && p.status === "vegan" ? (
        <p className="mt-2 text-xs text-muted-foreground">Also suitable for vegetarians.</p>
      ) : null}

      {alt.why_similar.length ? (
        <div className="mt-3">
          <p className="text-xs font-semibold text-foreground">Why it's similar</p>
          <ul className="mt-1 space-y-0.5 text-sm text-muted-foreground">
            {alt.why_similar.map((w) => <li key={w}>• {w}</li>)}
          </ul>
        </div>
      ) : null}

      {featured ? (
        <>
          <div className="mt-3">
            <p className="text-xs font-semibold text-foreground">Why it fits your preference</p>
            <p className="mt-1 text-sm text-muted-foreground">
              VegSeal verified this product as {verifiedLabel} based on the available ingredient information.
            </p>
          </div>
          {originalName ? (
            <div className="mt-3 rounded-xl bg-muted p-3 text-sm">
              <p className="text-xs font-semibold text-foreground">What's different?</p>
              <p className="mt-1 flex items-start gap-1.5 text-muted-foreground"><X className="mt-0.5 size-3.5 shrink-0 text-danger" /> {originalName}: {originalExplanation}</p>
              <p className="mt-1 flex items-start gap-1.5 text-muted-foreground"><Leaf className="mt-0.5 size-3.5 shrink-0 text-vegan" /> {p.name}: {p.explanation}</p>
            </div>
          ) : null}
        </>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          onClick={() =>
            setSaved(
              toggleFavorite({ id: p.id, barcode: p.barcode, name: p.name, brand: p.brand, image_url: p.image_url, status: p.status, scannedAt: Date.now() }),
            )
          }
          className="h-auto min-h-11 rounded-xl py-2.5"
        >
          <Heart className={["size-4", saved ? "fill-danger text-danger" : ""].join(" ")} /> {saved ? "Saved" : "Save"}
        </Button>
        <Button
          onClick={() => setShowIngredients((open) => !open)}
          aria-expanded={showIngredients}
          aria-controls={ingredientsId}
          className="h-auto min-h-11 rounded-xl px-2 py-2.5 text-center whitespace-normal leading-tight"
        >
          <List className="size-4 shrink-0" /> Full ingredient list
        </Button>
      </div>
      {showIngredients ? (
        <div id={ingredientsId} className="mt-3 border-t border-border pt-3">
          <p className="text-xs font-semibold text-foreground">Full ingredient list</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap break-words">
            {p.ingredients_text?.trim() || "An ingredient list isn't available for this product yet."}
          </p>
        </div>
      ) : null}
    </div>
  );
}
