import { Check, Loader2, RotateCcw } from "lucide-react";

export type StepState = "pending" | "active" | "done";

export interface ProgressStep {
  key: string;
  label: string;
  state: StepState;
}

export interface ScanProgressProps {
  steps: ProgressStep[];
  note?: string | null;
  product?: { name: string; brand: string | null; image_url: string | null } | null;
  slow?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

function Bullet({ state }: { state: StepState }) {
  if (state === "done") {
    return (
      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
        <Check className="size-3" strokeWidth={3} />
      </span>
    );
  }
  if (state === "active") {
    return (
      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
        <Loader2 className="size-3 animate-spin" strokeWidth={3} />
      </span>
    );
  }
  return (
    <span className="grid size-5 shrink-0 place-items-center">
      <span className="size-2 rounded-full border border-border" />
    </span>
  );
}

export function ScanProgress({ steps, note, product, slow, error, onRetry }: ScanProgressProps) {
  return (
    <div className="rounded-3xl border border-border bg-card p-4 shadow-card">
      {product ? (
        <div className="mb-3 flex items-center gap-3 rounded-2xl bg-background p-2 animate-fade-in">
          {product.image_url ? (
            <img
              src={product.image_url}
              alt=""
              className="size-11 shrink-0 rounded-lg bg-muted object-cover"
              loading="lazy"
            />
          ) : (
            <div className="size-11 shrink-0 rounded-lg bg-muted" />
          )}
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-wide text-primary">
              Product found
            </div>
            <div className="truncate text-sm font-semibold text-foreground">{product.name}</div>
            {product.brand ? (
              <div className="truncate text-xs text-muted-foreground">{product.brand}</div>
            ) : null}
          </div>
        </div>
      ) : null}

      <ul className="space-y-2.5">
        {steps.map((s) => (
          <li key={s.key} className="flex items-center gap-2.5">
            <Bullet state={s.state} />
            <span
              className={`text-sm transition-colors duration-300 ${
                s.state === "pending"
                  ? "text-muted-foreground/60"
                  : s.state === "active"
                    ? "font-medium text-foreground"
                    : "text-muted-foreground"
              }`}
            >
              {s.label}
            </span>
          </li>
        ))}
      </ul>

      {note && !error ? (
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground animate-fade-in">{note}</p>
      ) : null}

      {slow && !error ? (
        <p className="mt-3 rounded-2xl bg-muted/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground animate-fade-in">
          This is taking a little longer than usual. We&apos;re still checking the product carefully.
        </p>
      ) : null}

      {error ? (
        <div className="mt-3 animate-fade-in">
          <p className="text-sm text-foreground">{error}</p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              <RotateCcw className="size-3.5" /> Try again
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
