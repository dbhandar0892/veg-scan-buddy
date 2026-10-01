// Client-side local storage for scan history + favorites + dark mode.
// v1 is anonymous — no auth required.

export interface HistoryItem {
  id: string; // product uuid
  barcode: string | null;
  name: string;
  brand: string | null;
  image_url: string | null;
  status: "vegan" | "vegetarian" | "not_vegetarian" | "unknown";
  scannedAt: number;
}

const HISTORY_KEY = "vegseal.history.v1";
const FAV_KEY = "vegseal.favorites.v1";
const THEME_KEY = "vegseal.theme";

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function getHistory(): HistoryItem[] {
  if (typeof window === "undefined") return [];
  return safeParse<HistoryItem[]>(localStorage.getItem(HISTORY_KEY), []);
}

export function pushHistory(item: HistoryItem) {
  if (typeof window === "undefined") return;
  const all = getHistory().filter((h) => h.id !== item.id);
  all.unshift(item);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(all.slice(0, 200)));
  window.dispatchEvent(new Event("vegseal:history"));
}

export function removeHistory(id: string) {
  if (typeof window === "undefined") return;
  const all = getHistory().filter((h) => h.id !== id);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(all));
  window.dispatchEvent(new Event("vegseal:history"));
}

export function clearHistory() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(HISTORY_KEY);
  window.dispatchEvent(new Event("vegseal:history"));
}

export function getFavorites(): HistoryItem[] {
  if (typeof window === "undefined") return [];
  return safeParse<HistoryItem[]>(localStorage.getItem(FAV_KEY), []);
}

export function isFavorite(id: string): boolean {
  return getFavorites().some((f) => f.id === id);
}

function writeFavorites(list: HistoryItem[]) {
  localStorage.setItem(FAV_KEY, JSON.stringify(list));
  window.dispatchEvent(new Event("vegseal:favorites"));
}

async function signedInClient() {
  const { supabase } = await import("@/integrations/supabase/client");
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  return uid ? { supabase, uid } : null;
}

export function toggleFavorite(item: HistoryItem): boolean {
  if (typeof window === "undefined") return false;
  const all = getFavorites();
  const exists = all.some((f) => f.id === item.id);
  const next = exists ? all.filter((f) => f.id !== item.id) : [item, ...all];
  writeFavorites(next);
  // Save to the user's account so favorites survive app restarts and other devices.
  void (async () => {
    try {
      const c = await signedInClient();
      if (!c) return;
      if (exists) {
        await c.supabase.from("favorites").delete().eq("user_id", c.uid).eq("product_id", item.id);
      } else {
        await c.supabase
          .from("favorites")
          .upsert({ user_id: c.uid, product_id: item.id, item: item as never });
      }
    } catch (e) {
      console.warn("favorite sync failed", e);
    }
  })();
  return !exists;
}

/** Merge account favorites with this device's, uploading any device-only ones. */
export async function syncFavorites(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const c = await signedInClient();
    if (!c) return;
    const { data, error } = await c.supabase
      .from("favorites")
      .select("product_id,item,created_at")
      .eq("user_id", c.uid)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const remote = (data ?? []).map((r) => r.item as unknown as HistoryItem);
    const remoteIds = new Set(remote.map((r) => r.id));
    const localOnly = getFavorites().filter((f) => !remoteIds.has(f.id));
    if (localOnly.length) {
      await c.supabase.from("favorites").upsert(
        localOnly.map((f) => ({ user_id: c.uid, product_id: f.id, item: f as never })),
      );
    }
    writeFavorites([...localOnly, ...remote]);
  } catch (e) {
    console.warn("favorite sync failed", e);
  }
}

export function getTheme(): "light" | "dark" | "system" {
  if (typeof window === "undefined") return "system";
  const v = localStorage.getItem(THEME_KEY);
  return v === "light" || v === "dark" ? v : "system";
}

export function applyTheme(theme: "light" | "dark" | "system") {
  if (typeof window === "undefined") return;
  localStorage.setItem(THEME_KEY, theme);
  const root = document.documentElement;
  const resolved =
    theme === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme;
  root.classList.toggle("dark", resolved === "dark");
}

const DIET_KEY = "vegseal.diet";
export type DietPreference = "vegan" | "vegetarian";

export function getDietPreference(): DietPreference {
  if (typeof window === "undefined") return "vegan";
  return localStorage.getItem(DIET_KEY) === "vegetarian" ? "vegetarian" : "vegan";
}

export function setDietPreference(p: DietPreference) {
  if (typeof window === "undefined") return;
  localStorage.setItem(DIET_KEY, p);
}

/** Whether a product's status gives a reason to look for alternatives. */
export function needsAlternative(
  status: HistoryItem["status"],
  pref: DietPreference,
): boolean {
  return pref === "vegan" ? status !== "vegan" : status === "not_vegetarian" || status === "unknown";
}

// "Where I'm shopping right now" — remembered for one shopping session (4h),
// so the user isn't asked again for every scan but isn't locked in forever.
const STORE_KEY = "vegseal.shoppingStore";
const STORE_SESSION_MS = 4 * 60 * 60 * 1000;

export function getShoppingStore(): string | null {
  if (typeof window === "undefined") return null;
  const v = safeParse<{ name: string; at: number } | null>(localStorage.getItem(STORE_KEY), null);
  if (!v || Date.now() - v.at > STORE_SESSION_MS) return null;
  return v.name;
}

export function setShoppingStore(name: string | null) {
  if (typeof window === "undefined") return;
  if (name) localStorage.setItem(STORE_KEY, JSON.stringify({ name, at: Date.now() }));
  else localStorage.removeItem(STORE_KEY);
}
