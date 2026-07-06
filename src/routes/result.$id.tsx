import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, Heart, Share2, Users } from "lucide-react";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { StatusHero } from "@/components/Status";
import { getProduct, type AnalyzedProduct } from "@/lib/vegcheck.functions";
import { isFavorite, toggleFavorite } from "@/lib/local-store";
import type { IngredientHit } from "@/lib/analyzer";

const productQuery = (id: string) =>
  queryOptions({
    queryKey: ["product", id],
    queryFn: async () => {
      const p = await getProduct({ data: { id } });
      if (!p) throw notFound();
      return p;
    },
  });

export const Route = createFileRoute("/result/$id")({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(productQuery(params.id)),
  component: ResultPage,
  notFoundComponent: () => (
    <AppShell>
      <div className="px-5 pt-16 text-center">
        <p className="text-sm text-muted-foreground">This scan isn't in our records anymore.</p>
        <Link to="/scan" className="mt-4 inline-block text-sm font-medium text-primary">
          Scan again
        </Link>
      </div>
    </AppShell>
  ),
});

function ResultPage() {
  const { id } = Route.useParams();
  const { data: product } = useSuspenseQuery(productQuery(id));
  const navigate = useNavigate();
  const [fav, setFav] = useState(false);
  useEffect(() => setFav(isFavorite(product.id)), [product.id]);

  const hits: IngredientHit[] = Array.isArray(product.ingredient_hits)
    ? (product.ingredient_hits as unknown as IngredientHit[])
    : [];
  const interesting = hits.filter(
    (h) =>
      h.category === "animal" ||
      h.category === "unknown" ||
      h.vegan === false ||
      (h.sources && h.sources.length > 0),
  );

  const share = async () => {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({
          title: `VegCheck — ${product.name}`,
          text: `${product.name}: ${product.explanation}`,
          url: typeof window !== "undefined" ? window.location.href : undefined,
        });
      } catch {
        /* noop */
      }
    }
  };

  return (
    <AppShell>
      <div className="flex items-center justify-between px-4 pt-4">
        <button
          onClick={() => navigate({ to: "/" })}
          className="grid size-10 place-items-center rounded-full bg-card shadow-soft"
          aria-label="Back"
        >
          <ArrowLeft className="size-5" />
        </button>
        <div className="flex gap-2">
          <button
            onClick={() => setFav(toggleFavorite(historyItemFrom(product)))}
            className="grid size-10 place-items-center rounded-full bg-card shadow-soft"
            aria-label="Favorite"
          >
            <Heart
              className={["size-5", fav ? "fill-danger text-danger" : "text-foreground"].join(" ")}
            />
          </button>
          <button
            onClick={share}
            className="grid size-10 place-items-center rounded-full bg-card shadow-soft"
            aria-label="Share"
          >
            <Share2 className="size-5" />
          </button>
        </div>
      </div>

      <div className="px-5 pt-4">
        <div className="flex items-center gap-4">
          <div className="size-16 shrink-0 overflow-hidden rounded-2xl bg-muted">
            {product.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.image_url} alt="" className="size-full object-cover" />
            ) : null}
          </div>
          <div className="min-w-0">
            <h1 className="truncate font-display text-2xl leading-tight text-foreground">
              {product.name}
            </h1>
            {product.brand ? (
              <p className="truncate text-sm text-muted-foreground">{product.brand}</p>
            ) : null}
          </div>
        </div>

        <div className="mt-5">
          <StatusHero
            status={product.status}
            explanation={product.explanation}
            confidence={Number(product.confidence)}
          />
        </div>

        {product.verification === "manufacturer" ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-vegan">
            <span className="inline-flex size-5 items-center justify-center rounded-full bg-vegan-soft">
              <Check className="size-3.5 stroke-[3]" aria-hidden />
            </span>
            The company confirms this product is vegetarian friendly.
          </p>
        ) : product.verification === "community" ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <span className="inline-flex size-5 items-center justify-center rounded-full bg-muted">
              <Users className="size-3.5" aria-hidden />
            </span>
            Not confirmed by the company; verified by independent sources.
          </p>
        ) : null}

        {interesting.length > 0 ? (
          <section className="mt-8">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Ingredients of interest
            </h2>
            <ul className="mt-3 space-y-2">
              {interesting.map((h, idx) => (
                <li key={`${h.slug ?? h.token}-${idx}`}>
                  <div className="rounded-2xl border border-border bg-card p-3 shadow-soft">
                    {h.slug ? (
                      <Link
                        to="/ingredient/$slug"
                        params={{ slug: h.slug }}
                        className="flex items-center gap-3"
                      >
                        <CategoryBadge category={h.category} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-foreground">{h.name}</div>
                          <div className="text-xs text-muted-foreground">{h.explanation}</div>
                        </div>
                      </Link>
                    ) : (
                      <div className="flex items-center gap-3">
                        <CategoryBadge category={h.category} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-foreground">{h.name}</div>
                          <div className="text-xs text-muted-foreground">{h.explanation}</div>
                        </div>
                      </div>
                    )}
                    {h.sources && h.sources.length > 0 ? (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Confirmed by
                        </span>
                        {h.sources.slice(0, 3).map((s, i) => {
                          let host = s;
                          try {
                            host = new URL(s).hostname.replace(/^www\./, "");
                          } catch {
                            /* noop */
                          }
                          return (
                            <a
                              key={i}
                              href={s}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="rounded-full bg-vegan-soft px-2 py-0.5 text-[10px] font-medium text-vegan hover:underline"
                            >
                              {host}
                            </a>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {product.ingredients_text ? (
          <details className="mt-6 rounded-2xl border border-border bg-card p-4">
            <summary className="cursor-pointer text-sm font-medium text-foreground">
              Full ingredient list
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {product.ingredients_text}
            </p>
          </details>
        ) : null}

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Analyzed with VegCheck • Trust over guesses
        </p>
      </div>
    </AppShell>
  );
}

function CategoryBadge({ category }: { category: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    animal: { label: "Animal", cls: "bg-danger-soft text-danger" },
    plant: { label: "Plant", cls: "bg-vegan-soft text-vegan" },
    microbial: { label: "Microbial", cls: "bg-vegan-soft text-vegan" },
    mineral: { label: "Mineral", cls: "bg-muted text-muted-foreground" },
    synthetic: { label: "Synthetic", cls: "bg-muted text-muted-foreground" },
    unknown: { label: "Unclear", cls: "bg-warn-soft text-warn-foreground" },
  };
  const m = map[category] ?? map.unknown;
  return (
    <span
      className={[
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide",
        m.cls,
      ].join(" ")}
    >
      {m.label}
    </span>
  );
}

function historyItemFrom(p: AnalyzedProduct) {
  return {
    id: p.id,
    barcode: p.barcode,
    name: p.name,
    brand: p.brand,
    image_url: p.image_url,
    status: p.status,
    scannedAt: Date.now(),
  };
}
