import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Mail, Loader2 } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";

const authSearchSchema = z.object({
  redirect: z.enum(["/", "/profile", "/scan"]).optional().catch(undefined),
});

export const Route = createFileRoute("/auth")({
  validateSearch: (search) => authSearchSchema.parse(search),
  component: AuthPage,
  head: () => ({
    meta: [
      { title: "Sign in to VegSeal" },
      { name: "description", content: "Sign in to sync your scans and favorites across devices." },
      { property: "og:title", content: "Sign in to VegSeal" },
      { property: "og:description", content: "Sign in to sync your scans and favorites across devices." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function AppleGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M16.365 1.43c0 1.14-.42 2.22-1.26 3.04-.87.85-2.02 1.49-3.15 1.4-.14-1.1.42-2.25 1.19-3.01.86-.85 2.31-1.5 3.22-1.43zM20.5 17.28c-.55 1.28-.82 1.85-1.54 2.98-1 1.58-2.42 3.55-4.17 3.56-1.56.02-1.96-1.02-4.08-1-2.12.01-2.56 1.02-4.12 1.01-1.75-.02-3.09-1.78-4.09-3.36C-.35 16.61-.62 11.55 1.83 8.87c1.32-1.45 3.4-2.37 5.35-2.37 1.99 0 3.24 1.09 4.89 1.09 1.6 0 2.58-1.09 4.88-1.09 1.74 0 3.58.95 4.89 2.58-4.29 2.35-3.58 8.48-1.34 8.2z" />
    </svg>
  );
}

function GoogleGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.31 0-6-2.73-6-6.1s2.69-6.1 6-6.1c1.88 0 3.14.8 3.86 1.48l2.63-2.54C16.85 3.4 14.65 2.5 12 2.5 6.76 2.5 2.5 6.76 2.5 12S6.76 21.5 12 21.5c6.92 0 9.5-4.86 9.5-9.35 0-.63-.07-1.11-.16-1.6H12z" />
    </svg>
  );
}

function AuthPage() {
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();
  const destination = redirect ?? "/profile";
  const [email, setEmail] = useState("");
  const [showEmail, setShowEmail] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const finish = () => {
      if (!cancelled) navigate({ to: destination, replace: true });
    };

    const run = async () => {
      const url = new URL(window.location.href);
      const hash = new URLSearchParams(url.hash.replace(/^#/, ""));

      const errorDescription =
        url.searchParams.get("error_description") ?? hash.get("error_description");
      if (errorDescription) {
        setErr(
          /expired|invalid|not found/i.test(errorDescription)
            ? "That sign-in link has expired or was already used. Request a new one below."
            : errorDescription,
        );
        window.history.replaceState({}, "", url.pathname + url.search.replace(/[?&]error[^&]*/g, ""));
        return;
      }

      const code = url.searchParams.get("code");
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");

      try {
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          window.history.replaceState({}, "", `${url.pathname}${url.search.replace(/([?&])code=[^&]*/, "$1").replace(/[?&]$/, "")}`);
          finish();
          return;
        }
        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
          window.history.replaceState({}, "", url.pathname + url.search);
          finish();
          return;
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setErr(
            e instanceof Error && /expired|invalid|not found|code verifier/i.test(e.message)
              ? "That sign-in link has expired or was already used. Request a new one below."
              : "Could not complete sign-in. Please try again.",
          );
        }
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (data.session) finish();
    };

    run();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "SIGNED_IN" || event === "TOKEN_REFRESHED")) finish();
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [destination, navigate]);

  const oauth = async (provider: "google" | "apple") => {
    setErr(null);
    setBusy(provider);
    try {
      const result = await lovable.auth.signInWithOAuth(provider, {
        redirect_uri: `${window.location.origin}/auth?redirect=${encodeURIComponent(destination)}`,
      });
      if (result.error) throw new Error(String(result.error));
      if (result.redirected) return;
      navigate({ to: destination, replace: true });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Sign-in failed. Please try again.");
      setBusy(null);
    }
  };


  const sendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setErr(null);
    setMsg(null);
    setBusy("email");
    try {
      const emailRedirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/auth?redirect=${encodeURIComponent(destination)}`
          : undefined;
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo },
      });
      if (error) throw error;
      setMsg("Check your inbox for a sign-in link.");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Could not send email. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const skip = () => navigate({ to: "/" });

  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6">
        <header className="flex items-center justify-between pt-5">
          {showEmail ? (
            <button
              onClick={() => setShowEmail(false)}
              className="grid size-10 place-items-center rounded-full bg-card shadow-soft"
              aria-label="Back"
            >
              <ArrowLeft className="size-5" />
            </button>
          ) : (
            <div />
          )}
          {redirect ? (
            <div />
          ) : (
            <button
              onClick={skip}
              className="rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Skip
            </button>
          )}
        </header>

        <div className="flex flex-1 flex-col justify-center py-8">
          <div className="mb-10 text-center">
            <img src="/icon-512.png" alt="" className="mx-auto size-16 rounded-2xl shadow-soft" />
            <h1 className="mt-5 font-display text-[32px] leading-tight tracking-tight text-foreground">
              Welcome to VegSeal
            </h1>
            <p className="mt-2 text-base text-muted-foreground">
              {redirect === "/scan"
                ? "Create an account to start your 7-day free trial."
                : "Sign in to keep your scans across devices."}
            </p>
          </div>

          {!showEmail ? (
            <div className="space-y-3">
              <button
                onClick={() => oauth("apple")}
                disabled={busy !== null}
                className="flex w-full items-center justify-center gap-3 rounded-2xl bg-foreground py-4 text-base font-semibold text-background shadow-card transition active:scale-[0.99] disabled:opacity-60"
              >
                {busy === "apple" ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <AppleGlyph className="size-5" />
                )}
                Continue with Apple
              </button>
              <button
                onClick={() => oauth("google")}
                disabled={busy !== null}
                className="flex w-full items-center justify-center gap-3 rounded-2xl border border-border bg-card py-4 text-base font-semibold text-foreground shadow-soft transition active:scale-[0.99] disabled:opacity-60"
              >
                {busy === "google" ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <GoogleGlyph className="size-5" />
                )}
                Continue with Google
              </button>
              <button
                onClick={() => setShowEmail(true)}
                className="flex w-full items-center justify-center gap-3 rounded-2xl border border-border bg-card py-4 text-base font-semibold text-foreground shadow-soft transition active:scale-[0.99]"
              >
                <Mail className="size-5" />
                Continue with Email
              </button>
            </div>
          ) : (
            <form onSubmit={sendMagicLink} className="space-y-3">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Email address
                </span>
                <input
                  type="email"
                  autoFocus
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="mt-2 w-full rounded-2xl border border-border bg-card px-4 py-4 text-base outline-none focus:ring-2 focus:ring-ring"
                />
              </label>
              <button
                type="submit"
                disabled={busy !== null}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-base font-semibold text-primary-foreground shadow-card transition active:scale-[0.99] disabled:opacity-60"
              >
                {busy === "email" ? <Loader2 className="size-5 animate-spin" /> : null}
                Send sign-in link
              </button>
              {msg ? (
                <p className="rounded-xl bg-vegan-soft px-3 py-2 text-center text-sm text-vegan">
                  {msg}
                </p>
              ) : null}
            </form>
          )}

          {err ? (
            <p className="mt-4 rounded-xl bg-danger-soft px-3 py-2 text-center text-sm text-danger">
              {err}
            </p>
          ) : null}
        </div>

        <footer className="pb-8 text-center text-xs text-muted-foreground">
          By continuing you agree to our{" "}
          <Link to="/terms" className="underline underline-offset-2">
            Terms
          </Link>{" "}
          and{" "}
          <Link to="/privacy" className="underline underline-offset-2">
            Privacy
          </Link>
          .
        </footer>
      </div>
    </div>
  );
}
