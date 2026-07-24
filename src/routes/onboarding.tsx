import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ScanLine, Sparkles, ShieldCheck, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/onboarding")({
  component: OnboardingPage,
  head: () => ({
    meta: [
      { title: "Welcome to VegCheck" },
      { name: "description", content: "Instantly know if a food is vegan, vegetarian, or not — before you buy." },
      { property: "og:title", content: "Welcome to VegCheck" },
      { property: "og:description", content: "Scan any food and get an honest vegan/vegetarian answer in seconds." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

interface Slide {
  eyebrow: string;
  title: string;
  body: string;
  illustration: React.ReactNode;
}

function Illustration1() {
  return (
    <div className="relative mx-auto flex h-full w-full max-w-sm items-center justify-center">
      <div className="absolute inset-0 rounded-[2.5rem] bg-gradient-to-br from-vegan-soft via-background to-background" />
      <div className="relative flex flex-col items-center gap-6">
        <div className="grid size-40 place-items-center rounded-[2rem] bg-card shadow-card ring-1 ring-border">
          <ScanLine className="size-16 text-vegan" strokeWidth={1.5} />
          <div className="absolute inset-x-8 h-0.5 animate-pulse rounded-full bg-vegan/70" />
        </div>
        <div className="inline-flex items-center gap-2 rounded-full bg-vegan px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-soft">
          <span className="size-2 rounded-full bg-white" />
          Vegetarian
        </div>
      </div>
    </div>
  );
}

function Illustration2() {
  return (
    <div className="relative mx-auto flex h-full w-full max-w-sm items-center justify-center">
      <div className="absolute inset-0 rounded-[2.5rem] bg-gradient-to-br from-warn-soft via-background to-background" />
      <div className="relative w-full max-w-[280px] space-y-3">
        <div className="rounded-2xl bg-card p-4 shadow-soft ring-1 ring-border">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Ingredients
          </div>
          <p className="mt-2 text-sm leading-relaxed text-foreground">
            Sugar, wheat flour, palm oil,{" "}
            <mark className="rounded bg-warn-soft px-1 text-warn-foreground">rennet</mark>,{" "}
            salt,{" "}
            <mark className="rounded bg-warn-soft px-1 text-warn-foreground">carmine</mark>,{" "}
            natural flavor.
          </p>
        </div>
        <div className="rounded-2xl bg-vegan p-4 text-primary-foreground shadow-card">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest opacity-90">
            <Sparkles className="size-3.5" /> In plain English
          </div>
          <p className="mt-1.5 text-sm leading-snug">
            Carmine is a red color made from crushed insects.
          </p>
        </div>
      </div>
    </div>
  );
}

function Illustration3() {
  return (
    <div className="relative mx-auto flex h-full w-full max-w-sm items-center justify-center">
      <div className="absolute inset-0 rounded-[2.5rem] bg-gradient-to-br from-vegan-soft via-background to-background" />
      <div className="relative flex w-full max-w-[240px] flex-col items-center">
        <div className="w-full rounded-[2rem] border-[6px] border-foreground/90 bg-card p-4 shadow-card">
          <div className="rounded-2xl bg-vegan-soft p-4 text-center">
            <ShieldCheck className="mx-auto size-10 text-vegan" strokeWidth={2} />
            <div className="mt-2 text-sm font-semibold text-vegan">Vegan</div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              No animal-derived ingredients
            </div>
          </div>
          <div className="mt-3 rounded-xl bg-muted p-2 text-center text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            15 free scans included
          </div>
        </div>
      </div>
    </div>
  );
}

const SLIDES: Slide[] = [
  {
    eyebrow: "Confidence",
    title: "Know before you buy",
    body: "Instantly find out if a food product is vegan, vegetarian, or not vegetarian — before you buy it.",
    illustration: <Illustration1 />,
  },
  {
    eyebrow: "Clarity",
    title: "No more guessing",
    body: "We explain confusing ingredients like rennet, gelatin, and carmine in simple language, so you can shop with confidence.",
    illustration: <Illustration2 />,
  },
  {
    eyebrow: "Get started",
    title: "Start with 15 free scans",
    body: "Try VegCheck with 15 free scans. No credit card required. Upgrade anytime for unlimited scanning.",
    illustration: <Illustration3 />,
  },
];

function OnboardingPage() {
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const startX = useRef<number | null>(null);
  const deltaX = useRef(0);

  const goNext = () => {
    if (index < SLIDES.length - 1) setIndex(index + 1);
    else finish();
  };
  const goPrev = () => setIndex(Math.max(0, index - 1));

  const finish = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem("vegcheck.onboarded", "1");
    }
    navigate({ to: "/auth" });
  };

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    deltaX.current = 0;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (startX.current == null) return;
    deltaX.current = e.touches[0].clientX - startX.current;
  };
  const onTouchEnd = () => {
    if (Math.abs(deltaX.current) > 50) {
      if (deltaX.current < 0) goNext();
      else goPrev();
    }
    startX.current = null;
    deltaX.current = 0;
  };

  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
        <header className="flex items-center justify-between px-5 pt-5">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-primary">
            <img src="/icon-512.png" alt="" className="size-6 rounded-md" />
            VegCheck
          </div>
          <button
            onClick={finish}
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
            ref={trackRef}
            className="flex h-full w-full transition-transform duration-500 ease-out"
            style={{ transform: `translateX(-${index * 100}%)` }}
          >
            {SLIDES.map((s, i) => (
              <div
                key={i}
                className="flex h-full w-full shrink-0 flex-col px-6 pt-6"
                aria-hidden={i !== index}
              >
                <div className="flex-1 py-4">{s.illustration}</div>
                <div className="pb-2">
                  <div className="text-xs font-semibold uppercase tracking-widest text-primary">
                    {s.eyebrow}
                  </div>
                  <h1 className="mt-2 font-display text-[34px] leading-[1.05] tracking-tight text-foreground">
                    {s.title}
                  </h1>
                  <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                    {s.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <footer className="px-6 pb-8 pt-4">
          <div className="mb-6 flex justify-center gap-2">
            {SLIDES.map((_, i) => (
              <button
                key={i}
                onClick={() => setIndex(i)}
                aria-label={`Go to slide ${i + 1}`}
                className={[
                  "h-2 rounded-full transition-all",
                  i === index ? "w-8 bg-primary" : "w-2 bg-muted",
                ].join(" ")}
              />
            ))}
          </div>

          {index === SLIDES.length - 1 ? (
            <button
              onClick={finish}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-base font-semibold text-primary-foreground shadow-card transition active:scale-[0.99]"
            >
              Start Scanning
              <ArrowRight className="size-5" />
            </button>
          ) : (
            <button
              onClick={goNext}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-base font-semibold text-primary-foreground shadow-card transition active:scale-[0.99]"
            >
              Continue
              <ArrowRight className="size-5" />
            </button>
          )}
          <div className="mt-3 text-center text-xs text-muted-foreground">
            By continuing you agree to our{" "}
            <Link to="/terms" className="underline underline-offset-2">
              Terms
            </Link>{" "}
            and{" "}
            <Link to="/privacy" className="underline underline-offset-2">
              Privacy
            </Link>
            .
          </div>
        </footer>
      </div>
    </div>
  );
}
