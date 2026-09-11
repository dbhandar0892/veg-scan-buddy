import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { Loader2, X, HelpCircle } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ScanProgress, type ProgressStep } from "@/components/ScanProgress";
import {
  lookupBarcode,
  identifyBarcode,
  ocrIngredients,
  type ProductCandidate,
} from "@/lib/vegseal.functions";
import { pushHistory } from "@/lib/local-store";
import { useAccess } from "@/lib/access";
import { Paywall, TrialBanner } from "@/components/Paywall";

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

const STEP_LABELS: { key: string; label: string }[] = [
  { key: "product", label: "Checking product" },
  { key: "ingredients", label: "Analyzing ingredients" },
  { key: "animal", label: "Checking animal-derived ingredients" },
  { key: "uncertain", label: "Verifying uncertain ingredients" },
  { key: "final", label: "Finalizing result" },
];

function buildSteps(activeKey: string | null, doneKeys: string[], overrides: Record<string, string> = {}): ProgressStep[] {
  return STEP_LABELS.map((s) => ({
    key: s.key,
    label: overrides[s.key] ?? s.label,
    state: doneKeys.includes(s.key) ? "done" : s.key === activeKey ? "active" : "pending",
  }));
}

function ScanPage() {
  const navigate = useNavigate();
  const access = useAccess();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const busyRef = useRef(false);

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [candidates, setCandidates] = useState<ProductCandidate[] | null>(null);
  const [candidateQuery, setCandidateQuery] = useState<string>("");
  const [analysisMessage, setAnalysisMessage] = useState("Analyzing photo…");

  const [steps, setSteps] = useState<ProgressStep[] | null>(null);
  const [progressNote, setProgressNote] = useState<string | null>(null);
  const [foundProduct, setFoundProduct] = useState<{
    name: string;
    brand: string | null;
    image_url: string | null;
  } | null>(null);
  const [slow, setSlow] = useState(false);
  const slowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastBarcode = useRef<string | null>(null);

  const lookup = useServerFn(lookupBarcode);
  const identify = useServerFn(identifyBarcode);
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
          ? "Couldn't access your camera. You can still enter a barcode manually."
          : "Camera unavailable",
      );
    }
  };

  const resetProgress = () => {
    if (slowTimer.current) clearTimeout(slowTimer.current);
    slowTimer.current = null;
    setSlow(false);
    setSteps(null);
    setProgressNote(null);
    setFoundProduct(null);
  };

  const handleBarcode = async (code: string) => {
    lastBarcode.current = code;
    setStatus("looking-up");
    setError(null);
    setCandidates(null);
    setFoundProduct(null);
    setSlow(false);
    setProgressNote(null);
    setSteps(buildSteps("product", []));
    if (slowTimer.current) clearTimeout(slowTimer.current);
    slowTimer.current = setTimeout(() => setSlow(true), 11000);

    try {
      // Fast pass: identify the product so we can show it right away.
      const identity = await identify({ data: { barcode: code } });

      if (identity.kind === "cached") {
        setSteps(buildSteps(null, ["product", "ingredients", "animal", "uncertain", "final"]));
        setFoundProduct({
          name: identity.product.name,
          brand: identity.product.brand,
          image_url: identity.product.image_url,
        });
        resetProgress();
        done(identity.product);
        return;
      }

      if (identity.kind === "found") {
        setFoundProduct({
          name: identity.name,
          brand: identity.brand,
          image_url: identity.image_url,
        });
        setSteps(
          buildSteps(
            "ingredients",
            ["product"],
            identity.hasIngredients
              ? {}
              : { ingredients: "Finding the ingredient list on the web" },
          ),
        );
        setProgressNote(
          identity.hasIngredients
            ? "Checking ingredients and verifying the result…"
            : "No ingredient list on file — checking the manufacturer and reliable sources…",
        );
      } else {
        setSteps(buildSteps("product", [], { product: "Searching product databases" }));
        setProgressNote("This barcode isn't in the open databases — searching the web for it…");
      }

      const product = await lookup({ data: { barcode: code } });
      if (!product) {
        if (slowTimer.current) clearTimeout(slowTimer.current);
        lastBarcode.current = null;
        setStatus("error");
        setSteps(null);
        setError(
          `No product found for ${code}. Tap Scan Ingredient List to check the ingredients instead.`,
        );
        return;
      }
      setSteps(buildSteps(null, ["product", "ingredients", "animal", "uncertain", "final"]));
      resetProgress();
      done(product);
    } catch (e) {
      if (slowTimer.current) clearTimeout(slowTimer.current);
      setSlow(false);
      setStatus("error");
      setSteps(null);
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

  const captureIngredientsFromVideo = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setError("Camera isn't ready yet. Give it a moment and try again.");
      setStatus("error");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.9),
    );
    if (!blob) {
      setError("Couldn't capture the frame. Try again.");
      setStatus("error");
      return;
    }
    stopCamera();
    const file = new File([blob], "ingredients.jpg", { type: "image/jpeg" });
    await handleImage(file);
  };




  useEffect(() => {
    if (!access.hasAccess) return;
    start();
    return () => {
      stopCamera();
      if (slowTimer.current) clearTimeout(slowTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access.hasAccess]);

  const retry = () => {
    resetProgress();
    setError(null);
    const code = lastBarcode.current;
    if (code && status === "error") {
      lastBarcode.current = null;
      handleBarcode(code);
      return;
    }
    start();
  };


  const busy = status === "looking-up" || status === "analyzing";

  if (!access.loading && !access.hasAccess) {
    return (
      <AppShell>
        <div className="px-5 pt-8">
          <h1 className="font-display text-3xl tracking-tight text-foreground">
            Scan
          </h1>
        </div>
        <Paywall signedIn={Boolean(access.user)} />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="px-5 pt-8">
        <h1 className="font-display text-3xl tracking-tight text-foreground">
          Scan
        </h1>
      </div>

      {!access.isSubscribed && access.daysLeft > 0 ? (
        <TrialBanner daysLeft={access.daysLeft} />
      ) : null}


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
                Center the barcode in the frame
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
            <div className="absolute inset-0 grid place-items-center bg-background/92 p-4">
              {steps ? (
                <div className="w-full animate-fade-in">
                  <ScanProgress
                    steps={steps}
                    note={progressNote}
                    product={foundProduct}
                    slow={slow}
                  />
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  {analysisMessage}
                </div>
              )}
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

        <div className="mt-6 space-y-3">
          <button
            onClick={() => {
              setError(null);
              if (status !== "scanning") start();
            }}
            disabled={busy}
            className="flex h-16 w-full items-center justify-center gap-3 rounded-3xl bg-primary text-lg font-semibold text-primary-foreground shadow-lg shadow-primary/20 active:scale-[0.98] transition disabled:opacity-50"
          >
            <span className="text-2xl">📷</span>
            Scan Barcode
          </button>

          <div className="flex items-center justify-center gap-3 py-1">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              OR
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <button
            onClick={captureIngredientsFromVideo}
            disabled={busy || status !== "scanning"}
            className="flex h-16 w-full items-center justify-center gap-3 rounded-3xl border-2 border-border bg-card text-lg font-semibold text-foreground active:scale-[0.98] transition disabled:opacity-50"
          >
            <span className="text-2xl">📄</span>
            Scan Ingredient List
          </button>
        </div>

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

        <div className="mt-6">
          <form
            className="flex gap-2"
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
              placeholder="Enter barcode"
              className="flex-1 rounded-2xl border border-border bg-card px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="submit"
              className="rounded-2xl bg-secondary px-4 py-3 text-sm font-medium text-secondary-foreground"
            >
              Check
            </button>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
