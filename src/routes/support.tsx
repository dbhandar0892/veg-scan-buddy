import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [
      { title: "Help & Support — VegSeal" },
      {
        name: "description",
        content:
          "Get help with VegSeal scans, vegan and vegetarian alternatives, your account, and subscriptions.",
      },
      { property: "og:title", content: "Help & Support — VegSeal" },
      {
        property: "og:description",
        content: "Answers about scanning, finding alternatives, and your VegSeal account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SupportPage,
});

function SupportPage() {
  return (
    <AppShell>
      <div className="px-4 pt-4">
        <Link to="/settings" className="grid size-10 place-items-center rounded-full bg-card shadow-soft">
          <ArrowLeft className="size-5" />
        </Link>
      </div>
      <div className="px-5 pt-4 pb-10">
        <h1 className="font-display text-3xl tracking-tight text-foreground">Help &amp; Support</h1>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">
          Questions, problems, or a scan that doesn't look right? We're here to help.
        </p>

        <h2 className="mt-8 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Common questions
        </h2>
        <div className="mt-3 space-y-3">
          <Faq
            q="How accurate are the results?"
            a="We check every ingredient against a growing database and public food sources. When an ingredient's origin is genuinely uncertain — we say so, rather than guess. You can always tap an ingredient to see why it was flagged."
          />
          <Faq
            q="The app can't find my product"
            a="Try scanning the barcode first. If that fails, take a photo of the ingredient label instead — the app can read the list directly. Still stuck? Send us the product name and brand and we'll add it."
          />
          <Faq
            q="How are alternative products chosen?"
            a="From a product result, tap Find Vegan/Vegetarian Alternatives and choose your preference. VegSeal looks for similar products and checks their ingredients before showing verified matches."
          />
          <Faq
            q="A verdict looks wrong"
            a="Tell us the product and ingredient in question. Our ingredient knowledge is reviewed and expanded over time, and reports like yours directly improve the answers for everyone."
          />
          <Faq
            q="How does the free trial work?"
            a="New users get a 7-day free trial with unlimited scans. After that, VegSeal is $2.99/month, billed through your Apple ID. You can manage or cancel anytime in your iPhone's subscription settings."
          />
          <Faq
            q="How do I restore a purchase or delete my account?"
            a="Use 'Restore Purchase' on the subscription screen, or contact us below and we'll sort it out — including full account deletion on request."
          />
        </div>

        <h2 className="mt-8 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Contact us
        </h2>
        <div className="mt-3 rounded-2xl border border-border bg-card p-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Email us and we typically reply within 1–2 business days:
          </p>
          <a
            href="mailto:support@vegseal.com?subject=VegSeal%20Support"
            className="mt-2 inline-block font-medium text-primary underline underline-offset-4"
          >
            support@vegseal.com
          </a>
        </div>
      </div>
    </AppShell>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-sm font-medium text-foreground">{q}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{a}</p>
    </div>
  );
}
