import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Trash2, History as HistoryIcon } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { StatusPill } from "@/components/Status";
import { getHistory, removeHistory, clearHistory, type HistoryItem } from "@/lib/local-store";

export const Route = createFileRoute("/history")({
  component: HistoryPage,
});

function HistoryPage() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [q, setQ] = useState("");
  useEffect(() => {
    const load = () => setItems(getHistory());
    load();
    window.addEventListener("vegseal:history", load);
    return () => window.removeEventListener("vegseal:history", load);
  }, []);

  const filtered = items.filter((i) =>
    q.trim() ? i.name.toLowerCase().includes(q.toLowerCase()) : true,
  );

  return (
    <AppShell>
      <PageHeader
        back
        title="History"
        subtitle="Every product you've scanned, stored on this device."
        right={
          items.length > 0 ? (
            <button
              onClick={() => {
                if (confirm("Clear all history?")) clearHistory();
              }}
              className="rounded-full bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-soft"
            >
              Clear
            </button>
          ) : undefined
        }
      />
      {items.length > 0 ? (
        <div className="px-5">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search history"
            className="w-full rounded-2xl border border-border bg-card px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      ) : null}
      <div className="px-5 pt-4">
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center">
            <HistoryIcon className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">
              {items.length === 0 ? "You haven't scanned anything yet." : "No matching scans."}
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {filtered.map((i) => (
              <li key={i.id} className="group relative">
                <Link
                  to="/result/$id"
                  params={{ id: i.id }}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 pr-14 shadow-soft"
                >
                  <div className="size-12 shrink-0 overflow-hidden rounded-xl bg-muted">
                    {i.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={i.image_url} alt="" className="size-full object-cover" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">{i.name}</div>
                    {i.brand ? (
                      <div className="truncate text-xs text-muted-foreground">{i.brand}</div>
                    ) : null}
                  </div>
                  <StatusPill status={i.status} size="sm" />
                </Link>
                <button
                  onClick={() => removeHistory(i.id)}
                  className="absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted"
                  aria-label="Remove"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
