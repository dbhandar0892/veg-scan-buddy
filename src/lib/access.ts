// 7-day unlimited free trial, then a $2.99/month subscription.
// Trial starts when an account is created (profiles.trial_started_at).

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export const TRIAL_DAYS = 7;
export const PRICE_MONTHLY = "$2.99";

function isDefinitiveAuthError(message: string): boolean {
  return /invalid|expired|user_not_found|does not exist|sub claim/i.test(message);
}

export interface AccessState {
  loading: boolean;
  user: User | null;
  isSubscribed: boolean;
  trialStartedAt: string | null;
  /** Whole days remaining in the trial (0 when expired). */
  daysLeft: number;
  /** True when the user can scan. */
  hasAccess: boolean;
}

export function trialDaysLeft(trialStartedAt: string | null): number {
  if (!trialStartedAt) return 0;
  const start = new Date(trialStartedAt).getTime();
  if (Number.isNaN(start)) return 0;
  const endsAt = start + TRIAL_DAYS * 24 * 60 * 60 * 1000;
  const ms = endsAt - Date.now();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

// Remembered across route changes (and across app opens via localStorage) so
// the app can paint instantly instead of waiting on network round-trips.
const CACHE_KEY = "vegseal.access";

type CachedAccess = { userId: string; trialStartedAt: string | null; isSubscribed: boolean };

let memoryCache: CachedAccess | null = null;

function readCache(): CachedAccess | null {
  if (memoryCache) return memoryCache;
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    memoryCache = JSON.parse(raw) as CachedAccess;
    return memoryCache;
  } catch {
    return null;
  }
}

function writeCache(value: CachedAccess | null) {
  memoryCache = value;
  if (typeof localStorage === "undefined") return;
  try {
    if (value) localStorage.setItem(CACHE_KEY, JSON.stringify(value));
    else localStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore
  }
}

function stateFrom(user: User, cached: { trialStartedAt: string | null; isSubscribed: boolean }): AccessState {
  const daysLeft = trialDaysLeft(cached.trialStartedAt);
  return {
    loading: false,
    user,
    isSubscribed: cached.isSubscribed,
    trialStartedAt: cached.trialStartedAt,
    daysLeft,
    hasAccess: cached.isSubscribed || daysLeft > 0,
  };
}

const SIGNED_OUT: AccessState = {
  loading: false,
  user: null,
  isSubscribed: false,
  trialStartedAt: null,
  daysLeft: 0,
  hasAccess: false,
};

export function useAccess(): AccessState {
  const [state, setState] = useState<AccessState>({
    loading: true,
    user: null,
    isSubscribed: false,
    trialStartedAt: null,
    daysLeft: 0,
    hasAccess: false,
  });

  useEffect(() => {
    let active = true;

    const load = async () => {
      // Trust the locally stored session first so a network hiccup never
      // makes a signed-in user look signed out (and get bounced to /auth).
      const { data: sessionData } = await supabase.auth.getSession();
      const sessionUser = sessionData.session?.user ?? null;
      if (!active) return;

      if (!sessionUser) {
        writeCache(null);
        setState(SIGNED_OUT);
        return;
      }

      // Paint immediately from the last known trial/subscription state.
      const cached = readCache();
      if (cached && cached.userId === sessionUser.id) {
        setState(stateFrom(sessionUser, cached));
      }

      // Validate the session in the background; keep it on transient failures.
      let user = sessionUser;
      const { data: userData, error } = await supabase.auth.getUser();
      if (!active) return;
      if (!error && userData.user) user = userData.user;
      else if (error && isDefinitiveAuthError(error.message)) {
        await supabase.auth.signOut({ scope: "local" });
        if (!active) return;
        writeCache(null);
        setState(SIGNED_OUT);
        return;
      }

      let { data: profile } = await supabase
        .from("profiles")
        .select("trial_started_at, is_subscribed")
        .eq("id", user.id)
        .maybeSingle();
      if (!active) return;

      // Signed in but no profile row (e.g. account created before the
      // profiles trigger existed, or data was reset) — create it now so the
      // trial starts instead of the user being stuck on the paywall.
      if (!profile) {
        const { data: created } = await supabase
          .from("profiles")
          .upsert({ id: user.id }, { onConflict: "id" })
          .select("trial_started_at, is_subscribed")
          .maybeSingle();
        if (!active) return;
        profile = created;
      }

      const fresh = {
        trialStartedAt: profile?.trial_started_at ?? null,
        isSubscribed: profile?.is_subscribed ?? false,
      };
      writeCache({ userId: user.id, ...fresh });
      setState(stateFrom(user, fresh));
    };

    load();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") load();
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}

