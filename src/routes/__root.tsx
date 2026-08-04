import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { BottomNav } from "../components/BottomNav";
import { registerServiceWorker } from "../lib/register-sw";


function NotFoundComponent() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-6 text-center">
      <div className="max-w-sm">
        <span className="text-6xl">🥕</span>
        <h1 className="mt-4 font-display text-4xl text-foreground">Nothing to scan here</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This page doesn't exist. Let's head back to safe ingredients.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-soft hover:opacity-90"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-6 text-center">
      <div className="max-w-sm">
        <h1 className="font-display text-3xl text-foreground">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Please try again. If it keeps happening, restart the app.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
          >
            Try again
          </button>
          <Link
            to="/"
            className="rounded-full border border-border bg-background px-5 py-2.5 text-sm font-medium text-foreground"
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#f7fbf7" },
      { title: "VegSeal — Instantly know if food is vegan or vegetarian" },
      {
        name: "description",
        content:
          "Scan any barcode or ingredient label and instantly find out if a product is vegan, vegetarian, or contains animal ingredients.",
      },
      { name: "author", content: "VegSeal" },
      { property: "og:title", content: "VegSeal — Instantly know if food is vegan or vegetarian" },
      {
        property: "og:description",
        content:
          "Scan a barcode or ingredient label to see instantly whether a product is vegan, vegetarian, or contains animal ingredients.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "VegSeal — Instantly know if food is vegan or vegetarian" },
      { name: "description", content: "Scan any barcode or ingredient label and instantly find out if a product is vegan, vegetarian, or contains animal ingredients." },
      { property: "og:description", content: "Scan any barcode or ingredient label and instantly find out if a product is vegan, vegetarian, or contains animal ingredients." },
      { name: "twitter:description", content: "Scan any barcode or ingredient label and instantly find out if a product is vegan, vegetarian, or contains animal ingredients." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/9dc401ae-e7ec-4877-9307-26ea3153e744/id-preview-0ecdce80--5b2feb78-445e-4db0-baed-4a02ff5048aa.lovable.app-1783358869876.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/9dc401ae-e7ec-4877-9307-26ea3153e744/id-preview-0ecdce80--5b2feb78-445e-4db0-baed-4a02ff5048aa.lovable.app-1783358869876.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function ThemeBoot() {
  useEffect(() => {
    const stored = localStorage.getItem("vegseal.theme");
    const isDark =
      stored === "dark" ||
      (stored !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", isDark);
    registerServiceWorker();
  }, []);
  return null;
}


function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeBoot />
      <Outlet />
      <BottomNav />
    </QueryClientProvider>
  );
}
