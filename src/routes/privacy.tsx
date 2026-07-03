import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy — VegCheck" },
      { name: "description", content: "VegCheck stores your scans locally on your device." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <AppShell>
      <div className="px-4 pt-4">
        <Link to="/settings" className="grid size-10 place-items-center rounded-full bg-card shadow-soft">
          <ArrowLeft className="size-5" />
        </Link>
      </div>
      <div className="px-5 pt-4 space-y-4 text-sm leading-relaxed text-muted-foreground">
        <h1 className="font-display text-3xl tracking-tight text-foreground">Privacy</h1>
        <p>
          VegCheck keeps your scan history and favorites on your device. We do not track
          you and we do not sell your data.
        </p>
        <p>
          When you scan a barcode or a label, we look up product information from public
          food databases and analyze the ingredient list on our server. We may cache
          product records anonymously so future scans are faster for everyone.
        </p>
        <p>Camera and photo access is only used for scanning and never uploaded elsewhere.</p>
      </div>
    </AppShell>
  );
}
