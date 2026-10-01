// Retailer layer — kept separate from product data, dietary status, and AI
// similarity. It only answers "is this product associated with this retailer?"
// using Open Food Facts store data. It never reports live inventory.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { storeListed } from "./stores";

const UA = { "User-Agent": "VegSeal/1.0 (contact@vegseal.app)" };

function norm(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "");
}

async function timed(url: string, init: RequestInit, ms: number): Promise<Response | null> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: c.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export interface RetailerAssociation {
  barcode: string;
  store: string;
  carried: boolean; // retailer is listed as carrying this product
  source: "openfoodfacts";
}

export const checkRetailer = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ store: z.string().min(1).max(80), barcodes: z.array(z.string().min(4).max(32)).max(12) }).parse(input),
  )
  .handler(async ({ data }): Promise<RetailerAssociation[]> => {
    return Promise.all(
      data.barcodes.map(async (barcode) => {
        const res = await timed(
          `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}?fields=stores,stores_tags`,
          { headers: UA },
          5000,
        );
        let carried = false;
        if (res?.ok) {
          try {
            const j = (await res.json()) as { product?: { stores?: string; stores_tags?: string[] } };
            const names = [...(j.product?.stores_tags ?? []), ...(j.product?.stores ?? "").split(",")];
            carried = storeListed(names, data.store);
          } catch {
            /* ignore */
          }
        }
        return { barcode, store: data.store, carried, source: "openfoodfacts" as const };
      }),
    );
  });

// Nearby grocery stores from OpenStreetMap. Coordinates are rounded (~1 km)
// before leaving the device's request so no exact location is used.
export const nearbyStores = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }).parse(input),
  )
  .handler(async ({ data }): Promise<string[]> => {
    const lat = Math.round(data.lat * 100) / 100;
    const lon = Math.round(data.lon * 100) / 100;
    const q = `[out:json][timeout:8];(nwr["shop"~"supermarket|grocery|wholesale|department_store"](around:8000,${lat},${lon}););out tags 80;`;
    const res = await timed(
      "https://overpass-api.de/api/interpreter",
      { method: "POST", headers: { ...UA, "Content-Type": "application/x-www-form-urlencoded" }, body: `data=${encodeURIComponent(q)}` },
      9000,
    );
    if (!res?.ok) return [];
    try {
      const j = (await res.json()) as { elements?: { tags?: Record<string, string> }[] };
      const names = new Map<string, string>();
      for (const e of j.elements ?? []) {
        const n = (e.tags?.brand || e.tags?.name || "").trim();
        if (n && !names.has(norm(n))) names.set(norm(n), n);
      }
      return [...names.values()].slice(0, 15);
    } catch {
      return [];
    }
  });
