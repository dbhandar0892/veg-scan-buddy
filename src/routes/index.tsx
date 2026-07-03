import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ScanLine, Search, ArrowRight, Sparkles, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { StatusPill } from "@/components/Status";
import { getHistory, type HistoryItem } from "@/lib/local-store";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const [recent, setRecent] = useState<HistoryItem[]>([]);
  const [q, setQ] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const load = () => setRecent(getHistory().slice(0, 5));
    load();
    window.addEventListener("vegcheck:history", load);
    return () => window.removeEventListener("vegcheck:history", load);
  }, []);

  return (
    <AppShell>
      <div className="px-5 pt-10">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-primary">
          <Sparkles className="size-3.5" />
          VegCheck
        </div>
        <h1 className="mt-3 font-display text-[42px] leading-[1.05] tracking-tight text-foreground">
          Can I eat this?
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          Scan a barcode or ingredient label. Get an honest answer in seconds.
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

      <section className="mt-10 px-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Recent scans
          </h2>
          {recent.length > 0 ? (
            <Link to="/history" className="text-xs font-medium text-primary">
              See all
            </Link>
          ) : null}
        </div>
        {recent.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 p-6 text-center">
            <ShieldCheck className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">
              Your recent scans will appear here.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {recent.map((item) => (
              <li key={item.id}>
                <Link
                  to="/result/$id"
                  params={{ id: item.id }}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-soft"
                >
                  <div className="size-12 shrink-0 overflow-hidden rounded-xl bg-muted">
                    {item.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.image_url}
                        alt=""
                        className="size-full object-cover"
                        loading="lazy"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">
                      {item.name}
                    </div>
                    {item.brand ? (
                      <div className="truncate text-xs text-muted-foreground">{item.brand}</div>
                    ) : null}
                  </div>
                  <StatusPill status={item.status} size="sm" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
