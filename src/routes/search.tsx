import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { Search, Loader2, ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { searchProducts, lookupBarcode } from "@/lib/vegseal.functions";
import { StatusPill } from "@/components/Status";
import { pushHistory } from "@/lib/local-store";

const searchSchema = z.object({ q: z.string().optional() });

export const Route = createFileRoute("/search")({
  head: () => ({ meta: [
    { title: "Search food products | VegSeal" },
    { name: "description", content: "Search for a food product by name or brand to check its vegan and vegetarian status." },
    { property: "og:title", content: "Search food products | VegSeal" },
    { property: "og:description", content: "Search for a food product by name or brand to check its vegan and vegetarian status." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  validateSearch: (s) => searchSchema.parse(s),
  component: SearchPage,
});

function SearchPage() {
  const { q: initial } = Route.useSearch();
  const [q, setQ] = useState(initial ?? "");
  const [results, setResults] = useState<{
    local: Array<{
      id: string;
      name: string;
      brand: string | null;
      image_url: string | null;
      status: "vegan" | "vegetarian" | "not_vegetarian" | "unknown";
    }>;
    remote: Array<{ barcode: string; name: string; brand: string | null; image_url: string | null }>;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const search = useServerFn(searchProducts);
  const lookup = useServerFn(lookupBarcode);
  const navigate = useNavigate();

  const run = async (term: string) => {
    if (!term.trim()) return;
    setBusy(true);
    try {
      const r = await search({ data: { query: term.trim() } });
      setResults(r);
    } finally {
      setBusy(false);
    }
  };

  // Run initial query if provided
  useEffect(() => {
    if (initial) void run(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openRemote = async (barcode: string) => {
    setAnalyzing(barcode);
    try {
      const p = await lookup({ data: { barcode } });
      if (p) {
        pushHistory({
          id: p.id,
          barcode: p.barcode,
          name: p.name,
          brand: p.brand,
          image_url: p.image_url,
          status: p.status,
          scannedAt: Date.now(),
        });
        navigate({ to: "/result/$id", params: { id: p.id } });
      }
    } finally {
      setAnalyzing(null);
    }
  };

  return (
    <AppShell>
      <div className="flex items-center gap-3 px-4 pt-4">
        <Link
          to="/"
          className="grid size-10 place-items-center rounded-full bg-card shadow-soft"
          aria-label="Back"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <form
          className="flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            run(q);
          }}
        >
          <label className="flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2.5 shadow-soft">
            <Search className="size-4 text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search product or brand"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {busy ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
          </label>
        </form>
      </div>

      <div className="px-5 pt-6">
        {results ? (
          <>
            {results.local.length > 0 ? (
              <section>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Already analyzed
                </h2>
                <ul className="space-y-2">
                  {results.local.map((p) => (
                    <li key={p.id}>
                      <Link
                        to="/result/$id"
                        params={{ id: p.id }}
                        className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-soft"
                      >
                        <Thumb src={p.image_url} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-foreground">
                            {p.name}
                          </div>
                          {p.brand ? (
                            <div className="truncate text-xs text-muted-foreground">{p.brand}</div>
                          ) : null}
                        </div>
                        <StatusPill status={p.status} size="sm" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {results.remote.length > 0 ? (
              <section className="mt-6">
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  From the food database
                </h2>
                <ul className="space-y-2">
                  {results.remote.map((p) => (
                    <li key={p.barcode}>
                      <button
                        onClick={() => openRemote(p.barcode)}
                        disabled={analyzing !== null}
                        className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left shadow-soft disabled:opacity-60"
                      >
                        <Thumb src={p.image_url} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-foreground">
                            {p.name}
                          </div>
                          {p.brand ? (
                            <div className="truncate text-xs text-muted-foreground">{p.brand}</div>
                          ) : null}
                        </div>
                        {analyzing === p.barcode ? (
                          <Loader2 className="size-4 animate-spin text-muted-foreground" />
                        ) : (
                          <span className="text-xs font-medium text-primary">Check</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {results.local.length === 0 && results.remote.length === 0 ? (
              <p className="mt-8 text-center text-sm text-muted-foreground">
                No matches. Try scanning the barcode or ingredient label.
              </p>
            ) : null}
          </>
        ) : (
          <p className="mt-8 text-center text-sm text-muted-foreground">
            Type a product name to search.
          </p>
        )}
      </div>
    </AppShell>
  );
}

function Thumb({ src }: { src: string | null }) {
  return (
    <div className="size-12 shrink-0 overflow-hidden rounded-xl bg-muted">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-full object-cover" loading="lazy" />
      ) : null}
    </div>
  );
}
