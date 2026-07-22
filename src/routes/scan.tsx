import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { Loader2, X, Upload, Aperture, HelpCircle } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import {
  lookupBarcode,
  ocrIngredients,
  type ProductCandidate,
} from "@/lib/vegcheck.functions";
import { pushHistory } from "@/lib/local-store";

export const Route = createFileRoute("/scan")({
  component: ScanPage,
});

type Status =
  | "idle"
  | "starting"
  | "scanning"
  | "looking-up"
  | "analyzing"
  | "error";

function ScanPage() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const busyRef = useRef(false);

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [candidates, setCandidates] = useState<ProductCandidate[] | null>(null);
  const [candidateQuery, setCandidateQuery] = useState<string>("");
  const [analysisMessage, setAnalysisMessage] = useState("Analyzing photo…");

  const lookup = useServerFn(lookupBarcode);
  const ocr = useServerFn(ocrIngredients);

  const done = (p: {
    id: string;
    barcode: string | null;
    name: string;
    brand: string | null;
    image_url: string | null;
    status: "vegan" | "vegetarian" | "not_vegetarian" | "unknown";
  }) => {
    pushHistory({
      id: p.id,
      barcode: p.barcode,
      name: p.name,
      brand: p.brand,
      image_url: p.image_url,
      status: p.status,
      scannedAt: Date.now(),
    });
    navigate({ to: "/result/$id", params: { id: p.id } });
  };

  const stopCamera = () => {
    controlsRef.current?.stop();
    controlsRef.current = null;
  };

  const start = async () => {
    setError(null);
    setStatus("starting");
    try {
      const reader = new BrowserMultiFormatReader();
      const controls = await reader.decodeFromVideoDevice(
        undefined,
        videoRef.current!,
        async (result) => {
          if (!result || busyRef.current) return;
          busyRef.current = true;
          stopCamera();
          await handleBarcode(result.getText());
          busyRef.current = false;
        },
      );
      controlsRef.current = controls;
      setStatus("scanning");
    } catch (e) {
      setStatus("error");
      setError(
        e instanceof Error
          ? "Couldn't access your camera. You can still upload a photo."
          : "Camera unavailable",
      );
    }
  };

  const handleBarcode = async (code: string) => {
    setStatus("looking-up");
    try {
      const product = await lookup({ data: { barcode: code } });
      if (!product) {
        setStatus("error");
        setError(
          `No product found for ${code}. Take a photo of the product or its ingredients instead.`,
        );
        return;
      }
      done(product);
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
  };

  const handleImage = async (file: File) => {
    stopCamera();
    setStatus("analyzing");
    setError(null);
    setCandidates(null);
    setAnalysisMessage("Checking photo for a barcode…");
    try {
      const barcode = await decodeBarcodeFromImage(file);
      if (barcode) {
        setAnalysisMessage("Barcode found — looking it up…");
        await handleBarcode(barcode);
        return;
      }

      setAnalysisMessage("Reading product details…");
      const optimized = await optimizePhoto(file);
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const s = reader.result as string;
          resolve(s.slice(s.indexOf(",") + 1));
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(optimized.blob);
      });
      const result = await ocr({
        data: { imageBase64: base64, mime: optimized.mime },
      });
      if (result.kind === "product") {
        done(result.product);
      } else {
        setStatus("idle");
        setAnalysisMessage("Analyzing photo…");
        setCandidateQuery(result.query);
        setCandidates(result.candidates);
      }
    } catch (e) {
      setStatus("error");
      setError(
        e instanceof Error
          ? e.message
          : "Couldn't read the image",
      );
    }
  };

  const pickCandidate = async (c: ProductCandidate) => {
    setCandidates(null);
    await handleBarcode(c.barcode);
  };

  const decodeBarcodeFromImage = async (file: File): Promise<string | null> => {
    const url = URL.createObjectURL(file);
    try {
      const reader = new BrowserMultiFormatReader();
      const result = await reader.decodeFromImageUrl(url);
      const code = result.getText().replace(/\D/g, "");
      return code.length >= 4 ? code : null;
    } catch {
      return null;
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const optimizePhoto = async (
    file: File,
  ): Promise<{ blob: Blob; mime: string }> => {
    const bitmap = await createImageBitmap(file);
    const maxSide = 1280;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return { blob: file, mime: file.type || "image/jpeg" };
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.82),
    );
    return { blob: blob ?? file, mime: blob ? "image/jpeg" : file.type || "image/jpeg" };
  };

  const capturePhoto = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      fileInputRef.current?.click();
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((r) =>
      canvas.toBlob((b) => r(b), "image/jpeg", 0.9),
    );
    if (!blob) return;
    const file = new File([blob], "capture.jpg", { type: "image/jpeg" });
    await handleImage(file);
  };

  useEffect(() => {
    start();
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const retry = () => {
    setError(null);
    start();
  };

  const busy = status === "looking-up" || status === "analyzing";

  return (
    <AppShell>
      <div className="px-5 pt-8">
        <h1 className="font-display text-3xl tracking-tight text-foreground">
          Scan Product
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Point your camera at the barcode — we'll detect it automatically.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          No barcode? Tap <span className="font-medium text-foreground">Upload Photo</span> to send a picture of the product or its ingredients.
        </p>
      </div>

      <div className="mt-6 px-5">
        <div className="relative aspect-[4/5] overflow-hidden rounded-3xl bg-black shadow-card">
          <video
            ref={videoRef}
            className="size-full object-cover"
            playsInline
            muted
            autoPlay
          />

          {status === "scanning" ? (
            <>
              <div className="pointer-events-none absolute inset-x-8 top-1/2 h-40 -translate-y-1/2 rounded-2xl border-2 border-white/70" />
              <div className="pointer-events-none absolute inset-x-0 bottom-4 text-center text-xs text-white/85">
                Center the barcode in the frame — we'll detect it automatically
              </div>
            </>
          ) : null}

          {status === "starting" || status === "idle" ? (
            <div className="absolute inset-0 grid place-items-center bg-gradient-to-b from-black/40 to-black/70 text-white text-sm">
              <div className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" /> Starting camera…
              </div>
            </div>
          ) : null}

          {busy ? (
            <div className="absolute inset-0 grid place-items-center bg-background/85">
              <div className="flex items-center gap-2 text-sm text-foreground">
                <Loader2 className="size-4 animate-spin" />
                {status === "looking-up" ? "Looking it up…" : analysisMessage}
              </div>
            </div>
          ) : null}

          {status === "error" ? (
            <div className="absolute inset-0 grid place-items-center bg-background/90 px-6 text-center">
              <div>
                <div className="mx-auto grid size-10 place-items-center rounded-full bg-danger-soft text-danger">
                  <X className="size-5" />
                </div>
                <p className="mt-3 text-sm text-foreground">{error}</p>
                <button
                  onClick={retry}
                  className="mt-4 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                >
                  Try again
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            onClick={capturePhoto}
            disabled={busy || status !== "scanning"}
            className="flex items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-pop disabled:opacity-50"
          >
            <Aperture className="size-4" /> Take Photo
          </button>
          <button
            onClick={() => uploadInputRef.current?.click()}
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card py-3 text-sm font-medium text-foreground disabled:opacity-50"
          >
            <Upload className="size-4" /> Upload Photo
          </button>
        </div>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Take Photo captures whatever your camera sees now — the whole product or just its ingredients.
        </p>

        {candidates && candidates.length > 0 ? (
          <div className="mt-6 rounded-3xl border border-border bg-card p-4 shadow-card">
            <div className="flex items-start gap-2">
              <HelpCircle className="mt-0.5 size-4 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Which one is it?
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  We found a few products matching “{candidateQuery}”. Pick the right one, or retake the photo closer to the ingredients label for a definite answer.
                </p>
              </div>
            </div>
            <ul className="mt-3 space-y-2">
              {candidates.map((c) => (
                <li key={c.barcode}>
                  <button
                    type="button"
                    onClick={() => pickCandidate(c)}
                    className="flex w-full items-center gap-3 rounded-2xl border border-border bg-background p-2 text-left transition hover:border-primary/50"
                  >
                    {c.image_url ? (
                      <img
                        src={c.image_url}
                        alt=""
                        className="size-12 shrink-0 rounded-lg bg-muted object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="size-12 shrink-0 rounded-lg bg-muted" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-foreground">
                        {c.name}
                      </div>
                      {c.brand ? (
                        <div className="truncate text-xs text-muted-foreground">
                          {c.brand}
                        </div>
                      ) : null}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => {
                setCandidates(null);
                retry();
              }}
              className="mt-3 w-full rounded-full border border-border py-2 text-xs font-medium text-muted-foreground"
            >
              None of these — retake photo
            </button>
          </div>
        ) : null}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleImage(f);
            e.target.value = "";
          }}
        />
        <input
          ref={uploadInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleImage(f);
            e.target.value = "";
          }}
        />

        <div className="mt-6">
          <label className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Or enter the barcode
          </label>
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (manual.trim()) {
                stopCamera();
                handleBarcode(manual.trim());
              }
            }}
          >
            <input
              inputMode="numeric"
              value={manual}
              onChange={(e) => setManual(e.target.value.replace(/\D/g, ""))}
              placeholder="e.g. 3017620422003"
              className="flex-1 rounded-2xl border border-border bg-card px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="submit"
              className="rounded-2xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground"
            >
              Check
            </button>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
