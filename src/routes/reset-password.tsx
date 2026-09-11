import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
  head: () => ({
    meta: [
      { title: "Reset your VegSeal password" },
      { name: "description", content: "Choose a new password for your VegSeal account." },
      { property: "og:title", content: "Reset your VegSeal password" },
      { property: "og:description", content: "Choose a new password for your VegSeal account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const url = new URL(window.location.href);
      const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
      const code = url.searchParams.get("code");
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");

      try {
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
        }
        window.history.replaceState({}, "", url.pathname);
      } catch {
        if (!cancelled) setErr("That reset link has expired or was already used. Request a new one.");
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (!cancelled) {
        if (data.session) setReady(true);
        else setErr("That reset link has expired or was already used. Request a new one.");
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) return;
    setBusy(true);
    setErr(null);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setMsg("Password updated.");
      setTimeout(() => navigate({ to: "/", replace: true }), 700);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Could not update password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6">
        <h1 className="font-display text-[28px] leading-tight tracking-tight text-foreground">
          Choose a new password
        </h1>
        {ready ? (
          <form onSubmit={save} className="mt-6 space-y-3">
            <input
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password"
              className="w-full rounded-2xl border border-border bg-card px-4 py-4 text-base outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-base font-semibold text-primary-foreground shadow-card disabled:opacity-60"
            >
              {busy ? <Loader2 className="size-5 animate-spin" /> : null}
              Save password
            </button>
          </form>
        ) : (
          <p className="mt-4 text-base text-muted-foreground">
            {err ? "" : "Checking your reset link…"}
          </p>
        )}
        {msg ? (
          <p className="mt-4 rounded-xl bg-vegan-soft px-3 py-2 text-center text-sm text-vegan">{msg}</p>
        ) : null}
        {err ? (
          <p className="mt-4 rounded-xl bg-danger-soft px-3 py-2 text-center text-sm text-danger">{err}</p>
        ) : null}
      </div>
    </div>
  );
}
