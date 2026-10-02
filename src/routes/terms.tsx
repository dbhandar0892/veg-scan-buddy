import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms — VegSeal" },
      { name: "description", content: "Terms of use for VegSeal." },
      { property: "og:title", content: "Terms — VegSeal" },
      { property: "og:description", content: "Read the terms of use for VegSeal's food checks and information." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <AppShell>
      <div className="px-4 pt-4">
        <Link to="/settings" className="grid size-10 place-items-center rounded-full bg-card shadow-soft">
          <ArrowLeft className="size-5" />
        </Link>
      </div>
      <div className="px-5 pt-4 space-y-4 text-sm leading-relaxed text-muted-foreground">
        <h1 className="font-display text-3xl tracking-tight text-foreground">Terms</h1>
        <p>
          VegSeal is provided as-is for informational purposes. While we work hard to
          give trustworthy answers, always double-check the label if you have serious
          dietary restrictions, allergies, or medical concerns.
        </p>
        <p>By using the app you agree that VegSeal is not responsible for purchasing decisions.</p>
      </div>
    </AppShell>
  );
}
