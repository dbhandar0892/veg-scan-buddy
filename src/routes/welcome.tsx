import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { ScanLine, ShieldCheck, Sparkles, Check } from "lucide-react";

export const Route = createFileRoute("/welcome")({
  head: () => ({
    meta: [
      { title: "Welcome to VegCheck — Shop with confidence" },
      {
        name: "description",
        content:
          "Know instantly if a product is vegan, vegetarian, or contains animal ingredients. Start with 15 free scans.",
      },
      { property: "og:title", content: "Welcome to VegCheck" },
      {
        property: "og:description",
        content: "Know instantly if a product is vegan or vegetarian. Start with 15 free scans.",
      },
    ],
  }),
  component: WelcomePage,
});

type Slide = {
  headline: string;
  description: string;
  illustration: JSX.Element;
};

const slides: Slide[] = [
  {
    headline: "Know Before You Buy",
    description:
      "Instantly find out if a food product is Vegan, Vegetarian, or Not Vegetarian before you buy it.",
    illustration: <ScanIllustration />,
  },
  {
    headline: "No More Guessing",
    description:
      "We explain confusing ingredients like rennet, gelatin, and carmine in simple language, so you can shop with confidence.",
    illustration: <IngredientsIllustration />,
  },
  {
    headline: "Start with 15 Free Scans",
    description:
      "Try VegCheck with 15 free scans. No credit card required. Upgrade anytime for unlimited scanning.",
    illustration: <FreeScansIllustration />,
  },
];

function WelcomePage() {
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const startX = useRef<number | null>(null);
  const deltaX = useRef(0);

  const goAuth = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem("vegcheck.onboarded", "1");
    }
    navigate({ to: "/auth" });
  };

  const next = () => setIndex((i) => Math.min(i + 1, slides.length - 1));
  const prev = () => setIndex((i) => Math.max(i - 1, 0));

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    deltaX.current = 0;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (startX.current == null) return;
    deltaX.current = e.touches[0].clientX - startX.current;
  };
  const onTouchEnd = () => {
    if (startX.current == null) return;
    if (deltaX.current < -50) next();
    else if (deltaX.current > 50) prev();
    startX.current = null;
    deltaX.current = 0;
  };

  return (
    <div className="fixed inset-0 flex flex-col bg-background">
      <header className="flex items-center justify-between px-5 pt-6">
        <div className="text-xs font-semibold uppercase tracking-widest text-primary">
          VegCheck
        </div>
        <button
          onClick={goAuth}
          className="rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          Skip
        </button>
      </header>

      <div
        className="flex-1 overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div
          className="flex h-full transition-transform duration-500 ease-out"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {slides.map((s, i) => (
            <div
              key={i}
              className="flex h-full w-full shrink-0 flex-col items-center justify-between px-6 pb-8 pt-4"
            >
              <div className="flex flex-1 items-center justify-center w-full">
                {s.illustration}
              </div>
              <div className="mx-auto max-w-sm text-center">
                <h1 className="font-display text-[34px] font-semibold leading-tight tracking-tight text-foreground">
                  {s.headline}
                </h1>
                <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
                  {s.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <footer
        className="px-6 pt-2 pb-8"
        style={{ paddingBottom: "max(2rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mb-6 flex justify-center gap-2">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              aria-label={`Go to slide ${i + 1}`}
              className={[
                "h-2 rounded-full transition-all",
                i === index ? "w-8 bg-primary" : "w-2 bg-border",
              ].join(" ")}
            />
          ))}
        </div>

        {index === slides.length - 1 ? (
          <button
            onClick={goAuth}
            className="w-full rounded-2xl bg-primary py-4 text-base font-semibold text-primary-foreground shadow-card transition-transform active:scale-[0.98]"
          >
            Start Scanning
          </button>
        ) : (
          <button
            onClick={next}
            className="w-full rounded-2xl bg-primary py-4 text-base font-semibold text-primary-foreground shadow-card transition-transform active:scale-[0.98]"
          >
            Continue
          </button>
        )}
      </footer>
    </div>
  );
}

function ScanIllustration() {
  return (
    <div className="relative flex items-center justify-center">
      <div className="absolute -inset-8 rounded-[3rem] bg-gradient-to-br from-primary/15 via-primary/5 to-transparent blur-2xl" />
      <div className="relative flex h-[340px] w-[240px] flex-col items-center justify-between rounded-[2.5rem] border border-border bg-card p-4 shadow-card">
        <div className="mt-2 h-4 w-16 rounded-full bg-muted" />
        <div className="flex h-40 w-full items-center justify-center rounded-2xl bg-gradient-to-br from-muted to-muted/40">
          <ScanLine className="size-16 text-primary/70" strokeWidth={1.5} />
        </div>
        <div className="w-full space-y-2">
          <div className="flex items-center gap-2 rounded-2xl bg-primary px-3 py-2.5 text-primary-foreground">
            <div className="grid size-6 place-items-center rounded-full bg-primary-foreground/20">
              <Check className="size-4" strokeWidth={3} />
            </div>
            <div className="text-sm font-semibold">Vegetarian</div>
          </div>
          <div className="h-2 w-3/4 rounded-full bg-muted" />
          <div className="h-2 w-1/2 rounded-full bg-muted" />
        </div>
      </div>
    </div>
  );
}

function IngredientsIllustration() {
  return (
    <div className="relative flex items-center justify-center">
      <div className="absolute -inset-8 rounded-[3rem] bg-gradient-to-br from-primary/15 via-primary/5 to-transparent blur-2xl" />
      <div className="relative w-[280px] space-y-3">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Ingredients
          </div>
          <p className="text-xs leading-relaxed text-foreground">
            Sugar, cocoa butter, milk,{" "}
            <span className="rounded bg-amber-500/20 px-1 text-amber-700 dark:text-amber-300">
              rennet
            </span>
            , soy lecithin,{" "}
            <span className="rounded bg-amber-500/20 px-1 text-amber-700 dark:text-amber-300">
              carmine
            </span>
            , natural flavors,{" "}
            <span className="rounded bg-amber-500/20 px-1 text-amber-700 dark:text-amber-300">
              gelatin
            </span>
            .
          </p>
        </div>
        <div className="ml-6 rounded-2xl border border-border bg-card p-4 shadow-card">
          <div className="flex items-start gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10">
              <Sparkles className="size-4 text-primary" />
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground">Gelatin</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                Made from animal bones and skin. Not vegetarian.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FreeScansIllustration() {
  return (
    <div className="relative flex items-center justify-center">
      <div className="absolute -inset-8 rounded-[3rem] bg-gradient-to-br from-primary/15 via-primary/5 to-transparent blur-2xl" />
      <div className="relative flex h-[340px] w-[240px] flex-col rounded-[2.5rem] border border-border bg-card p-4 shadow-card">
        <div className="mx-auto mt-1 h-4 w-16 rounded-full bg-muted" />
        <div className="mt-6 flex flex-col items-center gap-3 text-center">
          <div className="grid size-16 place-items-center rounded-full bg-primary/10">
            <ShieldCheck className="size-8 text-primary" strokeWidth={2} />
          </div>
          <div className="font-display text-lg font-semibold text-foreground">
            Vegan
          </div>
          <div className="text-xs text-muted-foreground">
            Oat Milk · Barista Edition
          </div>
        </div>
        <div className="mt-auto flex justify-center">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground shadow-soft">
            <Sparkles className="size-3.5" />
            15 Free Scans Included
          </div>
        </div>
      </div>
    </div>
  );
}
