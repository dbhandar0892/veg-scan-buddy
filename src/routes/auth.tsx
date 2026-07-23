import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Apple, Mail, ArrowLeft, Loader2, Leaf } from "lucide-react";
import { lovable } from "@/integrations/lovable/index";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in to VegCheck" },
      {
        name: "description",
        content:
          "Sign in to VegCheck to sync your scans and save favorites across devices.",
      },
      { property: "og:title", content: "Sign in to VegCheck" },
      {
        property: "og:description",
        content: "Sign in to VegCheck to sync your scans and save favorites.",
      },
    ],
  }),
  component: AuthPage,
});

const CREAM = "#fdfcf8";
const SERIF = "'Fraunces', ui-serif, Georgia, serif";
const GREEN = "#166534";

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"choose" | "email">("choose");
  const [loading, setLoading] = useState<null | "google" | "apple" | "email">(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);

  const handleOAuth = async (provider: "google" | "apple") => {
    setError(null);
    setLoading(provider);
    try {
      const result = await lovable.auth.signInWithOAuth(provider, {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        setError(result.error.message || "Sign in failed. Please try again.");
        setLoading(null);
        return;
      }
      if (result.redirected) return;
      navigate({ to: "/" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign in failed.");
      setLoading(null);
    }
  };

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading("email");
    try {
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInErr) {
        const { error: signUpErr } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (signUpErr) {
          setError(signUpErr.message);
          setLoading(null);
          return;
        }
        setEmailSent(true);
        setLoading(null);
        return;
      }
      navigate({ to: "/" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setLoading(null);
    }
  };

  return (
    <div
      className="fixed inset-0 flex flex-col"
      style={{ backgroundColor: CREAM, color: "#1c1917" }}
    >
      <header className="flex items-center justify-between px-6 pt-6">
        {mode === "email" ? (
          <button
            onClick={() => {
              setMode("choose");
              setError(null);
              setEmailSent(false);
            }}
            className="grid size-9 place-items-center rounded-full text-stone-500 hover:bg-stone-100"
            aria-label="Back"
          >
            <ArrowLeft className="size-5" />
          </button>
        ) : (
          <div
            className="text-[11px] font-semibold uppercase tracking-[0.22em]"
            style={{ color: GREEN }}
          >
            VegCheck
          </div>
        )}
        <Link
          to="/"
          onClick={() => {
            if (typeof window !== "undefined") {
              localStorage.setItem("vegcheck.onboarded", "1");
            }
          }}
          className="rounded-full px-3 py-1.5 text-sm font-medium text-stone-500 hover:text-stone-900"
        >
          Not now
        </Link>
      </header>

      <div className="flex flex-1 flex-col justify-center px-6">
        <div className="mx-auto w-full max-w-sm">
          <div className="text-center">
            <div className="mx-auto grid size-16 place-items-center rounded-2xl border border-emerald-100 bg-emerald-50 shadow-[0_10px_24px_-12px_rgba(20,83,45,0.35)]">
              <Leaf className="size-7" style={{ color: GREEN }} strokeWidth={2.25} />
            </div>
            <div className="mt-6 text-[10px] font-semibold uppercase tracking-[0.28em] text-stone-400">
              {mode === "email" ? "Almost there" : "Welcome"}
            </div>
            <h1
              className="mt-2 text-[32px] font-semibold leading-[1.05] tracking-tight text-stone-900"
              style={{ fontFamily: SERIF }}
            >
              {mode === "email" ? "Continue with email" : "Shop with confidence"}
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed text-stone-500">
              {mode === "email"
                ? "We’ll create your account if you’re new."
                : "Sign in to save your scans and sync favorites across devices."}
            </p>
          </div>

          {error ? (
            <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          {emailSent ? (
            <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              Check your inbox to confirm your email, then sign in.
            </div>
          ) : null}

          {mode === "choose" ? (
            <div className="mt-8 space-y-3">
              <button
                onClick={() => handleOAuth("apple")}
                disabled={loading !== null}
                className="flex w-full items-center justify-center gap-3 rounded-2xl bg-stone-900 py-3.5 text-[15px] font-semibold text-white shadow-[0_10px_24px_-12px_rgba(0,0,0,0.4)] transition-transform active:scale-[0.98] disabled:opacity-60"
              >
                {loading === "apple" ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <Apple className="size-5" />
                )}
                Continue with Apple
              </button>

              <button
                onClick={() => handleOAuth("google")}
                disabled={loading !== null}
                className="flex w-full items-center justify-center gap-3 rounded-2xl border border-stone-200 bg-white py-3.5 text-[15px] font-semibold text-stone-900 shadow-[0_6px_16px_-10px_rgba(0,0,0,0.15)] transition-transform active:scale-[0.98] disabled:opacity-60"
              >
                {loading === "google" ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <GoogleIcon />
                )}
                Continue with Google
              </button>

              <div className="flex items-center gap-3 py-1">
                <div className="h-px flex-1 bg-stone-200" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-stone-400">
                  or
                </span>
                <div className="h-px flex-1 bg-stone-200" />
              </div>

              <button
                onClick={() => {
                  setMode("email");
                  setError(null);
                }}
                disabled={loading !== null}
                className="flex w-full items-center justify-center gap-3 rounded-2xl py-3.5 text-[15px] font-semibold text-white shadow-[0_10px_28px_-12px_rgba(20,83,45,0.5)] transition-transform active:scale-[0.98] disabled:opacity-60"
                style={{ backgroundColor: GREEN }}
              >
                <Mail className="size-5" />
                Continue with Email
              </button>
            </div>
          ) : (
            <form onSubmit={handleEmail} className="mt-8 space-y-3">
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3.5 text-[15px] text-stone-900 shadow-[0_2px_6px_-3px_rgba(0,0,0,0.08)] outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
              />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password (min. 6 characters)"
                className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3.5 text-[15px] text-stone-900 shadow-[0_2px_6px_-3px_rgba(0,0,0,0.08)] outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
              />
              <button
                type="submit"
                disabled={loading !== null}
                className="flex w-full items-center justify-center gap-3 rounded-2xl py-3.5 text-[15px] font-semibold text-white shadow-[0_10px_28px_-12px_rgba(20,83,45,0.5)] transition-transform active:scale-[0.98] disabled:opacity-60"
                style={{ backgroundColor: GREEN }}
              >
                {loading === "email" ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : null}
                Continue
              </button>
            </form>
          )}

          <p className="mt-8 text-center text-[11px] leading-relaxed text-stone-400">
            By continuing, you agree to our{" "}
            <Link to="/terms" className="underline decoration-stone-300">
              Terms
            </Link>{" "}
            and{" "}
            <Link to="/privacy" className="underline decoration-stone-300">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}
