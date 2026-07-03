import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Moon, Sun, Monitor, Star, MessageSquare, FileText, ShieldCheck, Info } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { applyTheme, getTheme } from "@/lib/local-store";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");
  useEffect(() => setTheme(getTheme()), []);
  const setT = (t: "light" | "dark" | "system") => {
    setTheme(t);
    applyTheme(t);
  };
  return (
    <AppShell>
      <PageHeader title="Settings" />
      <div className="px-5 space-y-6">
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Appearance
          </h2>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { id: "light", label: "Light", Icon: Sun },
                { id: "dark", label: "Dark", Icon: Moon },
                { id: "system", label: "Auto", Icon: Monitor },
              ] as const
            ).map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setT(id)}
                className={[
                  "flex flex-col items-center gap-2 rounded-2xl border p-4 text-sm font-medium",
                  theme === id
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-border bg-card text-muted-foreground",
                ].join(" ")}
              >
                <Icon className="size-5" />
                {label}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            App
          </h2>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            <Row href="/about" Icon={Info} label="About VegCheck" />
            <Row href="/privacy" Icon={ShieldCheck} label="Privacy" />
            <Row href="/terms" Icon={FileText} label="Terms" />
            <Row
              href="mailto:hello@vegcheck.app?subject=Feedback"
              external
              Icon={MessageSquare}
              label="Send feedback"
            />
            <Row
              href="https://apps.apple.com"
              external
              Icon={Star}
              label="Rate the app"
            />
          </ul>
        </section>

        <p className="pt-2 text-center text-xs text-muted-foreground">VegCheck v1.0</p>
      </div>
    </AppShell>
  );
}

function Row({
  href,
  label,
  Icon,
  external,
}: {
  href: string;
  label: string;
  Icon: typeof Sun;
  external?: boolean;
}) {
  const cls = "flex items-center gap-3 px-4 py-3.5 text-sm text-foreground hover:bg-muted/50";
  const body = (
    <>
      <Icon className="size-4 text-muted-foreground" />
      <span className="flex-1">{label}</span>
      <span className="text-muted-foreground">›</span>
    </>
  );
  if (external) {
    return (
      <li>
        <a href={href} className={cls} target="_blank" rel="noreferrer">
          {body}
        </a>
      </li>
    );
  }
  return (
    <li>
      <Link to={href} className={cls}>
        {body}
      </Link>
    </li>
  );
}
