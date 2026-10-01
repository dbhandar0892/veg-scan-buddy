import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MapPin, Search, X } from "lucide-react";
import { nearbyStores } from "@/lib/retailers.functions";

const COMMON = [
  "Walmart",
  "Target",
  "Whole Foods Market",
  "ShopRite",
  "Stop & Shop",
  "Kroger",
  "Publix",
  "Wegmans",
  "Trader Joe's",
  "Costco",
  "Aldi",
  "BJ's Wholesale Club",
  "Sam's Club",
  "Safeway",
  "Albertsons",
  "H-E-B",
  "Meijer",
  "Food Lion",
  "Giant",
  "Hannaford",
  "Sprouts",
  "Lidl",
];

export function StorePicker({
  store,
  onChange,
}: {
  store: string | null;
  onChange: (store: string | null) => void;
}) {
  const findNearby = useServerFn(nearbyStores);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [nearby, setNearby] = useState<string[] | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);

  const pick = (s: string) => {
    const name = s.trim();
    if (!name) return;
    onChange(name);
    setOpen(false);
    setQuery("");
  };

  const useLocation = () => {
    setLocError(null);
    if (!("geolocation" in navigator)) {
      setLocError("Location isn't available. Search for a store instead.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const list = await findNearby({ data: { lat: pos.coords.latitude, lon: pos.coords.longitude } });
          setNearby(list);
          if (!list.length) setLocError("No nearby stores found. Search for a store instead.");
        } catch {
          setLocError("Couldn't find nearby stores. Search for a store instead.");
        } finally {
          setLocating(false);
        }
      },
      () => {
        setLocating(false);
        setLocError("Location is off. Search for a store instead.");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  };

  const simplify = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const q = simplify(query);
  const pool = nearby?.length ? [...nearby, ...COMMON.filter((c) => !nearby.includes(c))] : COMMON;
  const options = pool.filter((s) => !q || simplify(s).includes(q));

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Where I'm Shopping Right Now</p>
          {store ? (
            <p className="mt-0.5 flex items-center gap-1 truncate text-sm text-foreground">
              <MapPin className="size-3.5 shrink-0 text-primary" /> {store}
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Shopping somewhere specific? Choose the store to see alternatives you may find there.
            </p>
          )}
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground"
        >
          {open ? "Close" : store ? "Change Store" : "Select Store"}
        </button>
      </div>

      {open ? (
        <div className="mt-4 space-y-3">
          <button
            onClick={useLocation}
            disabled={locating}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-sm font-medium text-foreground disabled:opacity-60"
          >
            {locating ? <Loader2 className="size-4 animate-spin" /> : <MapPin className="size-4" />} Use My Location
          </button>
          {locError ? <p className="text-xs text-muted-foreground">{locError}</p> : null}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              maxLength={80}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && pick(query)}
              placeholder="Search for a store"
              className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-16 text-sm text-foreground outline-none focus:border-primary"
            />
            {query.trim() ? (
              <button
                onClick={() => pick(options.length === 1 ? options[0] : query)}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
              >
                Select
              </button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">{nearby?.length ? "Nearby stores" : "Common stores"}</p>
          <div className="flex flex-wrap gap-2">
            {options.map((s) => (
              <button
                key={s}
                onClick={() => pick(s)}
                className={[
                  "rounded-full border px-3 py-1.5 text-sm",
                  store === s ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground",
                ].join(" ")}
              >
                {s}
              </button>
            ))}
            {q && !options.some((s) => simplify(s) === q) ? (
              <button onClick={() => pick(query)} className="rounded-full border border-dashed border-border px-3 py-1.5 text-sm text-foreground">
                Use "{query.trim()}"
              </button>
            ) : null}
          </div>
          {store ? (
            <button onClick={() => { onChange(null); setOpen(false); }} className="flex items-center gap-1 text-xs text-muted-foreground">
              <X className="size-3" /> Not shopping at a store
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
