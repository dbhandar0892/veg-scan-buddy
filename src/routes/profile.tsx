import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  LogOut,
  Loader2,
  Check,
  Settings as SettingsIcon,
  History,
  Heart,
  UserRound,
} from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
  head: () => ({
    meta: [
      { title: "Your VegSeal profile" },
      {
        name: "description",
        content: "Manage your VegSeal account, display name, and saved scans across devices.",
      },
      { property: "og:title", content: "Your VegSeal profile" },
      {
        property: "og:description",
        content: "Manage your VegSeal account, display name, and saved scans across devices.",
      },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function ProfilePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      setUser(data.user ?? null);
      if (data.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name, avatar_url")
          .eq("id", data.user.id)
          .maybeSingle();
        if (!active) return;
        setDisplayName(profile?.display_name ?? "");
        setAvatarUrl(profile?.avatar_url ?? null);
      }
      setLoading(false);
    };
    load();
    const { data: sub } = supabase.auth.onAuthStateChange(() => load());
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    setErr(null);
    setSaved(false);
    const { error } = await supabase
      .from("profiles")
      .upsert({ id: user.id, display_name: displayName.trim() || null }, { onConflict: "id" });
    if (error) {
      setErr("Could not save. Please try again.");
      setSaving(false);
      return;
    }
    setSaved(true);
    setSaving(false);
    setTimeout(() => navigate({ to: "/" }), 700);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  };

  if (loading) {
    return (
      <AppShell>
        <PageHeader title="Profile" />
        <div className="grid place-items-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  if (!user) {
    return (
      <AppShell>
        <PageHeader title="Profile" />
        <div className="px-5">
          <div className="rounded-3xl border border-border bg-card p-6 text-center shadow-soft">
            <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-accent">
              <UserRound className="size-7 text-accent-foreground" />
            </div>
            <h2 className="mt-4 font-display text-2xl text-foreground">You're not signed in</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Sign in to keep your scan history and favorites on every device.
            </p>
            <Link
              to="/auth"
              className="mt-5 inline-flex w-full items-center justify-center rounded-2xl bg-primary py-3.5 text-base font-semibold text-primary-foreground shadow-card"
            >
              Sign in
            </Link>
          </div>
          <ul className="mt-6 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            <NavRow to="/settings" Icon={SettingsIcon} label="Settings" />
          </ul>
        </div>
      </AppShell>
    );
  }

  const initial = (displayName || user.email || "?").charAt(0).toUpperCase();

  return (
    <AppShell>
      <PageHeader title="Profile" />
      <div className="space-y-6 px-5">
        <section className="flex items-center gap-4 rounded-3xl border border-border bg-card p-5 shadow-soft">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="size-14 rounded-2xl object-cover" />
          ) : (
            <div className="grid size-14 place-items-center rounded-2xl bg-accent font-display text-2xl text-accent-foreground">
              {initial}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate font-display text-xl text-foreground">
              {displayName || "VegSeal user"}
            </p>
            <p className="truncate text-sm text-muted-foreground">{user.email}</p>
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Display name
          </h2>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
            className="w-full rounded-2xl border border-border bg-card px-4 py-3.5 text-base outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            onClick={save}
            disabled={saving}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-base font-semibold text-primary-foreground shadow-card disabled:opacity-60"
          >
            {saving ? <Loader2 className="size-5 animate-spin" /> : null}
            {saved ? <Check className="size-5" /> : null}
            {saved ? "Saved" : "Save"}
          </button>
          {err ? (
            <p className="mt-2 rounded-xl bg-danger-soft px-3 py-2 text-center text-sm text-danger">
              {err}
            </p>
          ) : null}
        </section>

        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Your stuff
          </h2>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            <NavRow to="/history" Icon={History} label="Scan history" />
            <NavRow to="/favorites" Icon={Heart} label="Favorites" />
            <NavRow to="/settings" Icon={SettingsIcon} label="Settings" />
          </ul>
        </section>

        <button
          onClick={signOut}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card py-3.5 text-base font-semibold text-foreground"
        >
          <LogOut className="size-5" />
          Sign out
        </button>
      </div>
    </AppShell>
  );
}

function NavRow({
  to,
  label,
  Icon,
}: {
  to: "/history" | "/favorites" | "/settings";
  label: string;
  Icon: typeof Heart;
}) {
  return (
    <li>
      <Link
        to={to}
        className="flex items-center gap-3 px-4 py-3.5 text-sm text-foreground hover:bg-muted/50"
      >
        <Icon className="size-4 text-muted-foreground" />
        <span className="flex-1">{label}</span>
        <span className="text-muted-foreground">›</span>
      </Link>
    </li>
  );
}
