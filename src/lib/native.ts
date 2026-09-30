// Native iPhone features via Capacitor plugins (@capacitor/haptics, @capacitor/share).
// Uses window.Capacitor.Plugins so the web build doesn't need the packages;
// falls back to web APIs in the browser.

type Plugins = {
  Haptics?: {
    impact(o: { style: "LIGHT" | "MEDIUM" | "HEAVY" }): Promise<void>;
    notification(o: { type: "SUCCESS" | "WARNING" | "ERROR" }): Promise<void>;
  };
  Share?: { share(o: { title?: string; text?: string; url?: string; dialogTitle?: string }): Promise<unknown> };
};

function plugins(): Plugins {
  if (typeof window === "undefined") return {};
  const cap = (window as unknown as { Capacitor?: { Plugins?: Plugins; isNativePlatform?: () => boolean } }).Capacitor;
  return cap?.isNativePlatform?.() ? cap.Plugins ?? {} : {};
}

function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* noop */
  }
}

export function hapticTap() {
  const h = plugins().Haptics;
  if (h) h.impact({ style: "MEDIUM" }).catch(() => {});
  else vibrate(20);
}

export function hapticForStatus(status: string) {
  const h = plugins().Haptics;
  const type = status === "not_vegetarian" ? "ERROR" : status === "unknown" ? "WARNING" : "SUCCESS";
  if (h) h.notification({ type }).catch(() => {});
  else vibrate(type === "ERROR" ? [60, 60, 60] : type === "WARNING" ? [40, 40] : 30);
}

/** Returns "shared" | "copied" | "failed". */
export async function shareContent(opts: { title: string; text: string; url: string }) {
  const s = plugins().Share;
  try {
    if (s) {
      await s.share({ ...opts, dialogTitle: "Share result" });
      return "shared" as const;
    }
    if (typeof navigator !== "undefined" && "share" in navigator) {
      await navigator.share(opts);
      return "shared" as const;
    }
    await navigator.clipboard.writeText(`${opts.text}\n${opts.url}`);
    return "copied" as const;
  } catch {
    return "failed" as const;
  }
}
