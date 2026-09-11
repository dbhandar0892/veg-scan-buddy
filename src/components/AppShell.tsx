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
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-3 px-5 pt-8 pb-4">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
        {subtitle ? (
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {right}
    </header>
  );
}
