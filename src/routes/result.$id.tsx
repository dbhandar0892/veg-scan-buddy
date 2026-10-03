import { createFileRoute, Link, notFound, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, Heart, Leaf, Share2, Users } from "lucide-react";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { StatusHero } from "@/components/Status";
import { getProduct, type AnalyzedProduct } from "@/lib/vegseal.functions";
import {
  getDietPreference,
  isFavorite,
  needsAlternative,
  toggleFavorite,
  type DietPreference,
} from "@/lib/local-store";
import { hapticForStatus, hapticTap, shareContent } from "@/lib/native";
import { containsEgg } from "@/lib/analyzer";


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
  head: () => ({ meta: [
    { title: "Product scan result | VegSeal" },
    { name: "description", content: "Check a product's vegan or vegetarian status, read its ingredient explanation, and find similar alternatives." },
    { property: "og:title", content: "Product scan result | VegSeal" },
    { property: "og:description", content: "Read the ingredient explanation and find similar vegan or vegetarian alternatives when you need another option." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
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
  const router = useRouter();
  const [fav, setFav] = useState(false);
  const [copied, setCopied] = useState(false);
  const [diet, setDiet] = useState<DietPreference>("vegan");
  useEffect(() => setDiet(getDietPreference()), []);
  useEffect(() => setFav(isFavorite(product.id)), [product.id]);
  useEffect(() => hapticForStatus(product.status), [product.id, product.status]);

  const share = async () => {
    hapticTap();
    const label =
      product.status === "vegan"
        ? "is vegan ✅"
        : product.status === "vegetarian"
          ? "is vegetarian 🥛 (not vegan)"
          : product.status === "not_vegetarian"
            ? "is not vegetarian ❌"
            : "couldn't be confirmed ⚠️";
    const r = await shareContent({
      title: `VegSeal — ${product.name}`,
      text: `${product.name} ${label}\n${product.explanation}\nChecked with VegSeal`,
      url: `https://www.vegseal.com/result/${product.id}`,
    });
    if (r === "copied") {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <AppShell>
      <div className="flex items-center justify-between px-4 pt-4">
        <button
          onClick={() => {
            hapticTap();
            if (router.canGoBack()) router.history.back();
            else navigate({ to: "/" });
          }}
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
            {copied ? <Check className="size-5 text-primary" /> : <Share2 className="size-5" />}
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
            containsEgg={containsEgg(product.ingredients_text)}
          />
        </div>

        {product.status !== "unknown" && product.status !== "not_vegetarian" && product.verification === "manufacturer" ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-vegan">
            <span className="inline-flex size-5 items-center justify-center rounded-full bg-vegan-soft">
              <Check className="size-3.5 stroke-[3]" aria-hidden />
            </span>
            {product.status === "vegan"
              ? "Company confirms this is vegetarian and vegan friendly."
              : "Company confirms this is vegetarian friendly."}
          </p>
        ) : product.status !== "unknown" && product.status !== "not_vegetarian" && product.verification === "community" ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <span className="inline-flex size-5 items-center justify-center rounded-full bg-muted">
              <Users className="size-3.5" aria-hidden />
            </span>
            Verified by independent sources.
          </p>
        ) : null}




        {needsAlternative(product.status, diet) ? (
          <div className="mt-6 rounded-2xl border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">
              Looking for something similar? Let VegSeal find options that match your preference.
            </p>
            <Link
              to="/alternatives/$id"
              params={{ id: product.id }}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground"
            >
              <Leaf className="size-4" /> Find Vegan/Vegetarian Alternatives
            </Link>
          </div>
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
          Analyzed with VegSeal • Trust over guesses
        </p>
      </div>
    </AppShell>
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
