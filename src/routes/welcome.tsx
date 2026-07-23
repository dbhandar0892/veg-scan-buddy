import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState, type ReactNode } from "react";
import { Check, ChevronLeft } from "lucide-react";

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

const CREAM = "#fdfcf8";
const SERIF = "'Fraunces', ui-serif, Georgia, serif";

type Slide = {
  eyebrow: string;
  headline: ReactNode;
  description: string;
  illustration: ReactNode;
};

const slides: Slide[] = [
  {
    eyebrow: "01 · Scan",
    headline: (
      <>
        Know before
        <br />
        you buy
      </>
    ),
    description:
      "Instant scanning verdicts that decode complex product labels in seconds.",
    illustration: <ScanIllustration />,
  },
  {
    eyebrow: "02 · Decode",
    headline: (
      <>
        No more
        <br />
        guessing
      </>
    ),
    description:
      "Easily spot hidden animal derivatives like rennet, gelatin, and carmine.",
    illustration: <IngredientsIllustration />,
  },
  {
    eyebrow: "03 · Start",
    headline: (
      <>
        Let’s get
        <br />
        started
      </>
    ),
    description:
      "Kickstart your journey with 15 free scans. No credit card required.",
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

  const next = () => {
    if (index >= slides.length - 1) return goAuth();
    setIndex((i) => Math.min(i + 1, slides.length - 1));
  };
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

  const isLast = index === slides.length - 1;

  return (
    <div
      className="fixed inset-0 flex flex-col"
      style={{ backgroundColor: CREAM, color: "#1c1917" }}
    >
      <header className="flex items-center justify-between px-6 pt-6">
        <div
          className="text-[11px] font-semibold uppercase tracking-[0.22em]"
          style={{ color: "#166534" }}
        >
          VegCheck
        </div>
        <button
          onClick={goAuth}
          className="rounded-full px-3 py-1.5 text-sm font-medium text-stone-500 hover:text-stone-900 transition-colors"
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
              className="flex h-full w-full shrink-0 flex-col items-center justify-between px-8 pt-6 pb-4"
            >
              <div className="flex flex-1 items-center justify-center w-full">
                {s.illustration}
              </div>
              <div className="mx-auto max-w-sm text-center">
                <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-stone-400">
                  {s.eyebrow}
                </div>
                <h1
                  className="mt-3 text-[38px] font-semibold leading-[1.05] tracking-tight text-stone-900"
                  style={{ fontFamily: SERIF }}
                >
                  {s.headline}
                </h1>
                <p className="mt-4 text-[15px] leading-relaxed text-stone-500">
                  {s.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <footer
        className="px-6 pt-3 pb-6"
        style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mb-5 flex justify-center gap-1.5">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              aria-label={`Go to slide ${i + 1}`}
              className="h-1.5 rounded-full transition-all duration-300"
              style={{
                width: i === index ? 24 : 6,
                backgroundColor: i === index ? "#166534" : "#e7e5e4",
              }}
            />
          ))}
        </div>

        <button
          onClick={next}
          className="w-full rounded-2xl py-4 text-[15px] font-semibold text-white shadow-[0_10px_30px_-10px_rgba(20,83,45,0.45)] transition-transform active:scale-[0.98]"
          style={{ backgroundColor: "#166534" }}
        >
          {isLast ? "Get started" : "Continue"}
        </button>
      </footer>
    </div>
  );
}

function ScanIllustration() {
  return (
    <div className="relative flex items-center justify-center">
      <div
        className="absolute size-64 rounded-full blur-3xl"
        style={{ backgroundColor: "rgba(16,185,129,0.18)" }}
      />
      <div
        className="relative flex h-72 w-52 flex-col rounded-[28px] border border-stone-100 bg-white p-4 shadow-[0_24px_48px_-16px_rgba(20,83,45,0.25)]"
        style={{ transform: "rotate(-4deg)" }}
      >
        <div className="h-36 w-full overflow-hidden rounded-2xl">
          <div
            className="flex h-full w-full items-center justify-center"
            style={{
              background: "linear-gradient(135deg, #34d399 0%, #059669 100%)",
            }}
          >
            <div className="grid size-14 place-items-center rounded-full bg-white/25 backdrop-blur-sm">
              <Check className="size-8 text-white" strokeWidth={3} />
            </div>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          <div
            className="text-[9px] font-bold uppercase tracking-[0.2em]"
            style={{ color: "#166534" }}
          >
            Verdict
          </div>
          <div
            className="text-lg font-semibold text-stone-900"
            style={{ fontFamily: SERIF }}
          >
            Vegetarian
          </div>
          <div className="flex gap-1.5 pt-1">
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
              Dairy
            </span>
            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-600">
              12 items
            </span>
          </div>
        </div>
      </div>
      <div
        className="absolute -bottom-4 -right-2 rounded-2xl border border-stone-100 bg-white px-3 py-2 shadow-[0_12px_24px_-8px_rgba(0,0,0,0.12)]"
        style={{ transform: "rotate(6deg)" }}
      >
        <div className="text-[9px] font-bold uppercase tracking-widest text-stone-400">
          Scanned
        </div>
        <div className="text-xs font-semibold text-stone-900">0.4s</div>
      </div>
    </div>
  );
}

function IngredientsIllustration() {
  return (
    <div className="relative flex h-72 w-full items-center justify-center">
      <div
        className="absolute size-64 rounded-full blur-3xl"
        style={{ backgroundColor: "rgba(251,191,36,0.14)" }}
      />
      <div className="relative flex items-end gap-[-16px]">
        <IngredientCard
          tone="rose"
          label="Avoid"
          name="Carmine"
          note="Insect derived"
          rotate={-12}
          z={10}
        />
        <IngredientCard
          tone="stone"
          label="Checking"
          name="Gelatin"
          note="Animal bones"
          rotate={0}
          z={20}
          featured
        />
        <IngredientCard
          tone="amber"
          label="Alert"
          name="Rennet"
          note="From calf stomach"
          rotate={12}
          z={10}
        />
      </div>
    </div>
  );
}

function IngredientCard({
  tone,
  label,
  name,
  note,
  rotate,
  z,
  featured,
}: {
  tone: "rose" | "amber" | "stone";
  label: string;
  name: string;
  note: string;
  rotate: number;
  z: number;
  featured?: boolean;
}) {
  const tones = {
    rose: { bg: "#fff1f2", border: "#fecdd3", accent: "#be123c" },
    amber: { bg: "#fffbeb", border: "#fde68a", accent: "#b45309" },
    stone: { bg: "#ffffff", border: "#e7e5e4", accent: "#78716c" },
  }[tone];
  const size = featured ? "w-28 h-40" : "w-24 h-36";
  const shadow = featured
    ? "shadow-[0_20px_40px_-12px_rgba(0,0,0,0.18)]"
    : "shadow-[0_12px_24px_-10px_rgba(0,0,0,0.15)]";
  return (
    <div
      className={`${size} ${shadow} flex flex-col justify-between rounded-2xl border p-3 -mx-1`}
      style={{
        backgroundColor: tones.bg,
        borderColor: tones.border,
        transform: `rotate(${rotate}deg)`,
        zIndex: z,
      }}
    >
      <span
        className="text-[9px] font-bold uppercase tracking-[0.18em]"
        style={{ color: tones.accent }}
      >
        {label}
      </span>
      <div>
        <div
          className="text-sm font-semibold leading-tight text-stone-900"
          style={{ fontFamily: SERIF }}
        >
          {name}
        </div>
        <div className="mt-0.5 text-[10px] text-stone-500">{note}</div>
      </div>
    </div>
  );
}

function FreeScansIllustration() {
  return (
    <div className="relative flex h-72 items-center justify-center">
      <div
        className="absolute size-64 rounded-full blur-3xl"
        style={{ backgroundColor: "rgba(22,101,52,0.22)" }}
      />
      <div
        className="relative grid size-56 place-items-center rounded-full border-[10px] shadow-[0_28px_56px_-20px_rgba(20,83,45,0.5)]"
        style={{ backgroundColor: "#166534", borderColor: CREAM }}
      >
        <div className="text-center text-white">
          <div
            className="text-[64px] font-semibold leading-none"
            style={{ fontFamily: SERIF }}
          >
            15
          </div>
          <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.28em] text-emerald-100">
            Free scans
          </div>
        </div>
      </div>
      <div
        className="absolute -bottom-2 rounded-full border border-stone-100 bg-white px-3 py-1.5 text-[11px] font-semibold text-stone-700 shadow-md"
        style={{ right: "10%" }}
      >
        No card required
      </div>
    </div>
  );
}
