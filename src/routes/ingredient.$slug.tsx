import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { getIngredient } from "@/lib/vegseal.functions";

const ingredientQuery = (slug: string) =>
  queryOptions({
    queryKey: ["ingredient", slug],
    queryFn: async () => {
      const i = await getIngredient({ data: { slug } });
      if (!i) throw notFound();
      return i;
    },
  });

export const Route = createFileRoute("/ingredient/$slug")({
  head: ({ params }) => ({ meta: [
    { title: `Ingredient guide: ${params.slug.replace(/-/g, " ")} | VegSeal` },
    { name: "description", content: "Learn whether this ingredient is vegan or vegetarian and where it comes from." },
    { property: "og:title", content: `Ingredient guide: ${params.slug.replace(/-/g, " ")} | VegSeal` },
    { property: "og:description", content: "Learn whether this ingredient is vegan or vegetarian and where it comes from." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(ingredientQuery(params.slug)),
  component: IngredientPage,
  notFoundComponent: () => (
    <AppShell>
      <div className="px-5 pt-16 text-center text-sm text-muted-foreground">
        Ingredient not found.
      </div>
    </AppShell>
  ),
});

function verdict(v: boolean | null, label: string) {
  if (v === true) return { text: `${label}: Yes`, cls: "bg-vegan-soft text-vegan" };
  if (v === false) return { text: `${label}: No`, cls: "bg-danger-soft text-danger" };
  return { text: `${label}: Depends`, cls: "bg-warn-soft text-warn-foreground" };
}

function IngredientPage() {
  const { slug } = Route.useParams();
  const { data: ing } = useSuspenseQuery(ingredientQuery(slug));
  const veg = verdict(ing.vegetarian, "Vegetarian");
  const vgn = verdict(ing.vegan, "Vegan");
  return (
    <AppShell>
      <div className="px-4 pt-4">
        <Link
          to="/"
          className="inline-flex size-10 items-center justify-center rounded-full bg-card shadow-soft"
        >
          <ArrowLeft className="size-5" />
        </Link>
      </div>
      <div className="px-5 pt-4">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          {ing.category}
          {ing.e_number ? ` • ${ing.e_number}` : ""}
        </p>
        <h1 className="mt-2 font-display text-3xl tracking-tight text-foreground">{ing.name}</h1>

        <div className="mt-4 flex flex-wrap gap-2">
          <span className={["rounded-full px-3 py-1 text-xs font-semibold", vgn.cls].join(" ")}>
            {vgn.text}
          </span>
          <span className={["rounded-full px-3 py-1 text-xs font-semibold", veg.cls].join(" ")}>
            {veg.text}
          </span>
        </div>

        <p className="mt-6 font-display text-xl leading-snug text-foreground">{ing.explanation}</p>

        {ing.source ? (
          <div className="mt-6 rounded-2xl border border-border bg-card p-4">
            <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Where it comes from
            </div>
            <p className="mt-1 text-sm text-foreground">{ing.source}</p>
          </div>
        ) : null}

        {ing.aliases?.length ? (
          <div className="mt-4 rounded-2xl border border-border bg-card p-4">
            <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Also known as
            </div>
            <p className="mt-1 text-sm text-foreground">{ing.aliases.join(", ")}</p>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
