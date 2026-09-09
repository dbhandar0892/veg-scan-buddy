import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { CORS_HEADERS, errorResponse, jsonResponse, preflightResponse, readJsonBody } from "@/lib/api-http";
import {
  analyzeIngredientsCore,
  getIngredientCore,
  getProductCore,
  identifyBarcodeCore,
  listIngredientsCore,
  lookupBarcodeCore,
  ocrIngredientsCore,
  searchProductsCore,
} from "@/lib/vegseal.functions";

const barcodeSchema = z.object({ barcode: z.string().min(4).max(32) });
const analyzeSchema = z.object({ text: z.string().min(1).max(8000), name: z.string().max(200).optional() });
const ocrSchema = z.object({ imageBase64: z.string().min(100), mime: z.string().default("image/jpeg") });
const searchSchema = z.object({ query: z.string().min(1).max(120) });

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong";
}

export const Route = createFileRoute("/api/public/v1/$")({
  server: {
    handlers: {
      OPTIONS: async () => preflightResponse(),

      GET: async ({ params, request }) => {
        const action = params._splat ?? "";
        const url = new URL(request.url);
        try {
          switch (action) {
            case "health":
              return jsonResponse({ ok: true, service: "vegseal", version: 1 });
            case "product": {
              const id = z.string().uuid().safeParse(url.searchParams.get("id"));
              if (!id.success) return errorResponse("A valid product id is required");
              const product = await getProductCore({ id: id.data });
              if (!product) return errorResponse("Product not found", 404);
              return jsonResponse(product);
            }
            case "ingredient": {
              const slug = z.string().min(1).safeParse(url.searchParams.get("slug"));
              if (!slug.success) return errorResponse("An ingredient slug is required");
              const ingredient = await getIngredientCore({ slug: slug.data });
              if (!ingredient) return errorResponse("Ingredient not found", 404);
              return jsonResponse(ingredient);
            }
            case "ingredients":
              return jsonResponse(await listIngredientsCore());
            default:
              return errorResponse(`Unknown endpoint: ${action}`, 404);
          }
        } catch (error) {
          console.error(`[api/public/v1/${action}]`, error);
          return errorResponse(messageOf(error), 500);
        }
      },

      POST: async ({ params, request }) => {
        const action = params._splat ?? "";
        const body = await readJsonBody(request);
        try {
          switch (action) {
            case "lookup-barcode": {
              const parsed = barcodeSchema.safeParse(body);
              if (!parsed.success) return errorResponse("A barcode is required");
              const product = await lookupBarcodeCore(parsed.data);
              if (!product) return errorResponse("No product found for that barcode", 404);
              return jsonResponse(product);
            }
            case "identify-barcode": {
              const parsed = barcodeSchema.safeParse(body);
              if (!parsed.success) return errorResponse("A barcode is required");
              return jsonResponse(await identifyBarcodeCore(parsed.data));
            }
            case "analyze": {
              const parsed = analyzeSchema.safeParse(body);
              if (!parsed.success) return errorResponse("Ingredient text is required");
              return jsonResponse(await analyzeIngredientsCore(parsed.data));
            }
            case "ocr": {
              const parsed = ocrSchema.safeParse(body);
              if (!parsed.success) return errorResponse("An image is required");
              return jsonResponse(await ocrIngredientsCore(parsed.data));
            }
            case "search": {
              const parsed = searchSchema.safeParse(body);
              if (!parsed.success) return errorResponse("A search query is required");
              return jsonResponse(await searchProductsCore(parsed.data));
            }
            default:
              return errorResponse(`Unknown endpoint: ${action}`, 404);
          }
        } catch (error) {
          console.error(`[api/public/v1/${action}]`, error);
          return errorResponse(messageOf(error), 500);
        }
      },
    },
  },
});

export const _corsHeaders = CORS_HEADERS;
