import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { StatusPill } from "@/components/Status";
import { getFavorites, syncFavorites, type HistoryItem } from "@/lib/local-store";

export const Route = createFileRoute("/favorites")({
  head: () => ({ meta: [
    { title: "Favorite products | VegSeal" },
    { name: "description", content: "View food products saved to your VegSeal favorites." },
    { property: "og:title", content: "Favorite products | VegSeal" },
    { property: "og:description", content: "View food products saved to your VegSeal favorites." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: FavoritesPage,
});

function FavoritesPage() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  useEffect(() => {
    const load = () => setItems(getFavorites());
    load();
    void syncFavorites();
    window.addEventListener("vegseal:favorites", load);
    return () => window.removeEventListener("vegseal:favorites", load);
  }, []);
  return (
    <AppShell>
      <PageHeader back title="Favorites" subtitle="Save products you buy again and again." />
      <div className="px-5 pt-2">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center">
            <Heart className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">
              Tap the heart on a scan to save it here.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((i) => (
              <li key={i.id}>
                <Link
                  to="/result/$id"
                  params={{ id: i.id }}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-soft"
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
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
