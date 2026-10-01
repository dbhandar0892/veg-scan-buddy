import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Heart, Info, Leaf, Loader2, MapPin, ScanLine, Sparkles, X } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { StatusPill } from "@/components/Status";
import { StorePicker } from "@/components/StorePicker";
import { checkRetailer } from "@/lib/retailers.functions";
import {
  findAlternatives,
  getProduct,
  type AlternativeResult,
  type AlternativesResponse,
} from "@/lib/vegseal.functions";
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
  const run = useServerFn(findAlternatives);
  const [pref, setPref] = useState<DietPreference>("vegan");
  const [priorities, setPriorities] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AlternativesResponse | null>(null);
  const [showHow, setShowHow] = useState(false);
  const [searchedStore, setSearchedStore] = useState<string | null>(null);
  const [store, setStore] = useState<string | null>(null);
  const [carried, setCarried] = useState<Set<string>>(new Set());
  const checkStore = useServerFn(checkRetailer);
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

  // Retailer association is looked up separately from dietary verification.
  useEffect(() => {
    setCarried(new Set());
    const barcodes = (result?.verified ?? []).map((a) => a.product.barcode).filter((b): b is string => !!b);
    if (!store || !barcodes.length) return;
    let cancelled = false;
    checkStore({ data: { store, barcodes } })
      .then((rows) => {
        if (!cancelled) setCarried(new Set([...(searchedStore === store ? (result?.storeBarcodes ?? []) : []), ...rows.filter((r) => r.carried).map((r) => r.barcode)]));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [store, result, checkStore]);

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
    setError(null);
    setResult(null);
    try {
      setSearchedStore(store);
      setResult(await run({ data: { id, preference: pref, priorities, note: note || undefined, store: store || undefined } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const toggle = (p: string) =>
    setPriorities((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));

  const storeSet = new Set(searchedStore === store ? (result?.storeBarcodes ?? []) : []);
  // Store-only finds are shown in the store section, not as Best Match.
  const general = (result?.verified ?? []).filter((a) => !a.product.barcode || !storeSet.has(a.product.barcode));
  const [best, ...others] = general.length ? general : (result?.verified ?? []);
  const atStore = store ? (result?.verified ?? []).filter((a) => a.product.barcode && carried.has(a.product.barcode)) : [];
  const atStoreIds = new Set(atStore.map((a) => a.product.id));
  const moreOptions = others.filter((a) => !atStoreIds.has(a.product.id));

  return (
    <AppShell>
      <PageHeader back title="Find Vegan/Vegetarian Alternatives" />
      <div className="space-y-6 px-5 pb-10">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Similar to</p>
          <div className="mt-2 flex items-center gap-3">
            <div className="size-12 shrink-0 overflow-hidden rounded-xl bg-muted">
              {original.image_url ? <img src={original.image_url} alt="" className="size-full object-cover" /> : null}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-foreground">{original.name}</p>
              {original.brand ? <p className="truncate text-sm text-muted-foreground">{original.brand}</p> : null}
            </div>
            <StatusPill status={original.status} size="sm" />
          </div>
        </div>

        <StorePicker store={store} onChange={changeStore} />

        {!result && !loading ? (
          <>
            <section>
              <h2 className="mb-2 text-sm font-semibold text-foreground">My preference</h2>
              <div className="grid grid-cols-2 gap-2">
                {(["vegan", "vegetarian"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => {
                      setPref(p);
                      setDietPreference(p);
                    }}
                    className={[
                      "rounded-2xl border p-3 text-sm font-medium capitalize",
                      pref === p ? "border-primary bg-primary/5 text-foreground" : "border-border bg-card text-muted-foreground",
                    ].join(" ")}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h2 className="mb-2 text-sm font-semibold text-foreground">What matters most? <span className="font-normal text-muted-foreground">(optional)</span></h2>
              <div className="flex flex-wrap gap-2">
                {PRIORITIES.map((p) => (
                  <button
                    key={p}
                    onClick={() => toggle(p)}
                    className={[
                      "rounded-full border px-3.5 py-1.5 text-sm",
                      priorities.includes(p) ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground",
                    ].join(" ")}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <label htmlFor="alt-note" className="mb-2 block text-sm font-semibold text-foreground">
                Anything else you want? <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <input
                id="alt-note"
                value={note}
                maxLength={300}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. something similar but spicy"
                className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm text-foreground outline-none focus:border-primary"
              />
            </section>

            {error ? <p className="text-sm text-danger">{error}</p> : null}

            <button
              onClick={search}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-4 font-medium text-primary-foreground shadow-soft"
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
                <p className="text-sm text-muted-foreground">This usually takes 20–40 seconds.</p>
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

            {atStore.length ? (
              <section>
                <h2 className="mb-1 font-display text-2xl text-foreground">Products You May Find at This Store</h2>
                <p className="mb-3 text-xs text-muted-foreground">
                  Listed as carried by {store}. Availability may vary by location and inventory.
                </p>
                <div className="space-y-3">
                  {atStore.map((a) => (
                    <AltCard key={a.product.id} alt={a} pref={pref} store={store} />
                  ))}
                </div>
              </section>
            ) : null}

            {store && !atStore.length && result.verified.length ? (
              <p className="rounded-2xl bg-muted p-3 text-xs text-muted-foreground">
                We don't have store listings showing these products at {store} yet, so they're shown as general alternatives. They may still be sold there — scan to check when you find one.
              </p>
            ) : null}

            {best ? (
              <section>
                <h2 className="mb-2 font-display text-2xl text-foreground">Best Match</h2>
                <p className="mb-3 text-xs text-muted-foreground">Closest to what you scanned and what you asked for.</p>
                <AltCard alt={best} pref={pref} store={best.product.barcode && carried.has(best.product.barcode) ? store : null} featured originalName={original.name} originalExplanation={original.explanation} />
              </section>
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

            {moreOptions.length ? (
              <section>
                <h2 className="mb-3 text-lg font-semibold text-foreground">
                  {atStore.length ? `More ${prefLabel} Alternatives` : "More Options"}
                </h2>
                <div className="space-y-3">
                  {moreOptions.map((a) => (
                    <AltCard key={a.product.id} alt={a} pref={pref} />
                  ))}
                </div>
              </section>
            ) : null}

            {result.unverified.length ? (
              <section>
                <h2 className="mb-1 text-sm font-semibold text-foreground">We couldn't verify these yet</h2>
                <p className="mb-3 text-xs text-muted-foreground">
                  Similar products whose ingredients we couldn't fully confirm. We won't label them {prefLabel} without enough evidence — scan one in store to check.
                </p>
                <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
                  {result.unverified.map((u) => (
                    <li key={`${u.brand}-${u.name}`} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-foreground">{u.name}</p>
                        {u.brand ? <p className="truncate text-xs text-muted-foreground">{u.brand}</p> : null}
                      </div>
                      <span className="shrink-0 text-xs text-warn-foreground">Could not verify</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <p className="text-center text-xs text-muted-foreground">Availability may vary by store.</p>

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
  store,
}: {
  store?: string | null;
  alt: AlternativeResult;
  pref: DietPreference;
  featured?: boolean;
  originalName?: string;
  originalExplanation?: string;
}) {
  const p = alt.product;
  const [saved, setSaved] = useState(false);
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
      {store ? (
        <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="size-3 text-primary" /> You may find this at {store}
        </p>
      ) : null}
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

      <div className="mt-4 flex gap-2">
        <button
          onClick={() =>
            setSaved(
              toggleFavorite({ id: p.id, barcode: p.barcode, name: p.name, brand: p.brand, image_url: p.image_url, status: p.status, scannedAt: Date.now() }),
            )
          }
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border py-2.5 text-sm font-medium text-foreground"
        >
          <Heart className={["size-4", saved ? "fill-danger text-danger" : ""].join(" ")} /> {saved ? "Saved" : "Save"}
        </button>
        <Link to="/scan" className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-sm font-medium text-primary-foreground">
          <ScanLine className="size-4" /> Scan This Product
        </Link>
      </div>
    </div>
  );
}
