import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About VegCheck" },
      { name: "description", content: "VegCheck is a trust-first vegan and vegetarian food scanner." },
      { property: "og:title", content: "About VegCheck" },
      {
        property: "og:description",
        content: "A trust-first food scanner that answers one question: is this vegan or vegetarian?",
      },
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
        <h1 className="font-display text-3xl tracking-tight text-foreground">About VegCheck</h1>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
          VegCheck exists to answer one question: <em>can I eat this?</em> Scan a barcode
          or ingredient label, and we tell you plainly if a product is vegan,
          vegetarian, or contains animal ingredients.
        </p>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
          We never guess. When an ingredient's origin is uncertain, we say so, so you can
          decide what's right for you.
        </p>
        <p className="mt-6 text-sm text-muted-foreground">
          Product data comes from the open food community. Ingredient explanations are
          reviewed and expanded over time. Nothing here is medical advice.
        </p>
      </div>
    </AppShell>
  );
}
