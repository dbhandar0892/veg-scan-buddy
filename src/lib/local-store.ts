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

const HISTORY_KEY = "vegcheck.history.v1";
const FAV_KEY = "vegcheck.favorites.v1";
const THEME_KEY = "vegcheck.theme";

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
  window.dispatchEvent(new Event("vegcheck:history"));
}

export function removeHistory(id: string) {
  if (typeof window === "undefined") return;
  const all = getHistory().filter((h) => h.id !== id);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(all));
  window.dispatchEvent(new Event("vegcheck:history"));
}

export function clearHistory() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(HISTORY_KEY);
  window.dispatchEvent(new Event("vegcheck:history"));
}

export function getFavorites(): HistoryItem[] {
  if (typeof window === "undefined") return [];
  return safeParse<HistoryItem[]>(localStorage.getItem(FAV_KEY), []);
}

export function isFavorite(id: string): boolean {
  return getFavorites().some((f) => f.id === id);
}

export function toggleFavorite(item: HistoryItem): boolean {
  if (typeof window === "undefined") return false;
  const all = getFavorites();
  const exists = all.some((f) => f.id === item.id);
  const next = exists ? all.filter((f) => f.id !== item.id) : [item, ...all];
  localStorage.setItem(FAV_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event("vegcheck:favorites"));
  return !exists;
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
