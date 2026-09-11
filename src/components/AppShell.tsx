import type { ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto max-w-md pb-28">{children}</div>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  right,
  back,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  back?: boolean;
}) {
  const router = useRouter();
  return (
    <header className="flex items-start justify-between gap-3 px-5 pt-8 pb-4">
      <div className="flex items-start gap-1">
        {back ? (
          <button
            type="button"
            onClick={() => router.history.back()}
            aria-label="Go back"
            className="-ml-2 mt-0.5 grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted"
          >
            <ChevronLeft className="size-6" />
          </button>
        ) : null}
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
          {subtitle ? (
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {right}
    </header>
  );
}
