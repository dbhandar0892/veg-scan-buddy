import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ScanLine, Search, ArrowRight } from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const [q, setQ] = useState("");
  const navigate = useNavigate();

  return (
    <AppShell>
      <div className="px-5 pt-10">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-primary">
          <img
            src="/icon-512.png"
            alt=""
            className="size-7 rounded-lg"
            width={28}
            height={28}
          />
          VegSeal
        </div>
        <h1 className="mt-3 font-display text-[32px] leading-[1.05] tracking-tight text-foreground sm:text-[42px]">
          Know Before You Buy
        </h1>
        <p className="mt-2 text-xs text-muted-foreground sm:text-sm">
          <span className="font-bold">Find out if a product is vegan or vegetarian in seconds.</span>
          <br />
          <span className="italic">Backed by ingredient analysis and manufacturer research.</span>
        </p>
      </div>

      <div className="mt-8 px-5">
        <Link
          to="/scan"
          className="group relative flex items-center gap-4 overflow-hidden rounded-3xl bg-primary p-6 text-primary-foreground shadow-card"
        >
          <div className="grid size-14 place-items-center rounded-2xl bg-primary-foreground/15 backdrop-blur">
            <ScanLine className="size-7" strokeWidth={2} />
          </div>
          <div className="flex-1">
            <div className="text-lg font-semibold">Scan a product</div>
            <div className="text-sm opacity-85">Barcode or ingredient label</div>
          </div>
          <ArrowRight className="size-5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) navigate({ to: "/search", search: { q: q.trim() } });
        }}
        className="mt-4 px-5"
      >
        <label className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-soft focus-within:ring-2 focus-within:ring-ring">
          <Search className="size-5 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search a product by name or brand"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>
      </form>
    </AppShell>
  );
}
