import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About VegSeal" },
      { name: "description", content: "Check food ingredients with VegSeal and find similar vegan or vegetarian alternatives." },
      { property: "og:title", content: "About VegSeal" },
      {
        property: "og:description",
        content: "Scan food, understand its ingredients, and find similar vegan or vegetarian alternatives.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <AppShell>
      <div className="px-4 pt-4">
        <Link to="/settings" className="grid size-10 place-items-center rounded-full bg-card shadow-soft">
          <ArrowLeft className="size-5" />
        </Link>
      </div>
      <div className="px-5 pt-4">
        <h1 className="font-display text-3xl tracking-tight text-foreground">About VegSeal</h1>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
          VegSeal exists to answer one question: <em>can I eat this?</em> Scan a barcode
          or ingredient label, and we tell you plainly if a product is vegan,
          vegetarian, or contains animal ingredients.
        </p>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
          We never guess. When an ingredient's origin is uncertain, we say so, so you can
          decide what's right for you.
        </p>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
          If you want another option, you can find similar products that match your vegan
          or vegetarian preference. We check each alternative's ingredients before showing it
          as a match. Store selection is for your shopping context, not a promise of availability.
        </p>
        <p className="mt-6 text-sm text-muted-foreground">
          Product data comes from the open food community. Ingredient explanations are
          reviewed and expanded over time. Nothing here is medical advice.
        </p>
      </div>
    </AppShell>
  );
}
