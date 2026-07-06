import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { Camera, ScanLine, Loader2, X, CheckCircle2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { lookupBarcode, ocrIngredients } from "@/lib/vegcheck.functions";
import { pushHistory } from "@/lib/local-store";

type Mode = "barcode" | "photo";

export const Route = createFileRoute("/scan")({
  component: ScanPage,
});

function ScanPage() {
  const [mode, setMode] = useState<Mode>("barcode");
  return (
    <AppShell>
      <div className="px-5 pt-8">
        <h1 className="font-display text-3xl tracking-tight text-foreground">Scan a product</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          We only tell you the truth. Never a guess.
        </p>
      </div>

      <div className="mt-5 px-5">
        <div className="flex gap-1 rounded-2xl bg-muted p-1">
          {(
            [
              { id: "barcode", label: "Barcode", Icon: ScanLine },
              { id: "photo", label: "Photo", Icon: Camera },

            ] as const
          ).map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setMode(id)}
              className={[
                "flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                mode === id
                  ? "bg-background text-foreground shadow-soft"
                  : "text-muted-foreground",
              ].join(" ")}
            >
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 px-5">
        {mode === "barcode" ? <BarcodeMode /> : <PhotoMode />}
      </div>
    </AppShell>
  );
}

function useAfterAnalyze() {
  const navigate = useNavigate();
  return (p: {
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
}

function BarcodeMode() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const [status, setStatus] = useState<"idle" | "scanning" | "looking-up" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const lookup = useServerFn(lookupBarcode);
  const done = useAfterAnalyze();

  const start = async () => {
    setError(null);
    setStatus("scanning");
    try {
      const reader = new BrowserMultiFormatReader();
      const controls = await reader.decodeFromVideoDevice(
        undefined,
        videoRef.current!,
        async (result) => {
          if (!result) return;
          controlsRef.current?.stop();
          controlsRef.current = null;
          await handleBarcode(result.getText());
        },
      );
      controlsRef.current = controls;
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Camera unavailable");
    }
  };

  const handleBarcode = async (code: string) => {
    setStatus("looking-up");
    try {
      const product = await lookup({ data: { barcode: code } });
      if (!product) {
        setStatus("error");
        setError(`No product found for ${code}. Try scanning the label instead.`);
        return;
      }
      done(product);
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
  };

  useEffect(() => {
    return () => controlsRef.current?.stop();
  }, []);

  return (
    <div>
      <div className="relative aspect-[4/5] overflow-hidden rounded-3xl bg-black shadow-card">
        <video
          ref={videoRef}
          className="size-full object-cover"
          playsInline
          muted
          autoPlay
        />
        {status === "idle" ? (
          <div className="absolute inset-0 grid place-items-center bg-gradient-to-b from-black/40 to-black/70 text-white">
            <button
              onClick={start}
              className="flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground shadow-pop"
            >
              <Camera className="size-4" /> Start camera
            </button>
          </div>
        ) : null}
        {status === "scanning" ? (
          <>
            <div className="pointer-events-none absolute inset-x-8 top-1/2 h-40 -translate-y-1/2 rounded-2xl border-2 border-white/70" />
            <div className="pointer-events-none absolute inset-x-0 bottom-4 text-center text-xs text-white/85">
              Point at a barcode
            </div>
          </>
        ) : null}
        {status === "looking-up" ? (
          <div className="absolute inset-0 grid place-items-center bg-background/80">
            <div className="flex items-center gap-2 text-sm text-foreground">
              <Loader2 className="size-4 animate-spin" /> Looking it up…
            </div>
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="mt-3 flex items-start gap-2 rounded-2xl bg-danger-soft p-3 text-sm text-danger">
          <X className="mt-0.5 size-4" /> <span>{error}</span>
        </div>
      ) : null}

      <div className="mt-5">
        <label className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Or enter the barcode
        </label>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (manual.trim()) handleBarcode(manual.trim());
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
  );
}

function PhotoMode() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ocr = useServerFn(ocrIngredients);
  const done = useAfterAnalyze();

  const onFile = (f: File | null) => {
    setError(null);
    setFile(f);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(f ? URL.createObjectURL(f) : null);
  };

  const submit = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const s = reader.result as string;
          resolve(s.slice(s.indexOf(",") + 1));
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const product = await ocr({
        data: { imageBase64: base64, mime: file.type || "image/jpeg" },
      });
      done(product);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the label");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <label className="block aspect-[4/5] cursor-pointer overflow-hidden rounded-3xl border-2 border-dashed border-border bg-muted/40">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Product photo" className="size-full object-cover" />
        ) : (
          <div className="grid h-full place-items-center text-center">
            <div>
              <Camera className="mx-auto size-8 text-muted-foreground" />
              <div className="mt-3 text-sm font-medium text-foreground">
                Take or upload a photo
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                of the product or its ingredient label
              </div>
            </div>
          </div>
        )}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        />
      </label>

      {error ? (
        <div className="mt-3 rounded-2xl bg-danger-soft p-3 text-sm text-danger">{error}</div>
      ) : null}

      <button
        disabled={!file || busy}
        onClick={submit}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
        {busy ? "Analyzing photo…" : "Analyze photo"}
      </button>

    </div>
  );
}

