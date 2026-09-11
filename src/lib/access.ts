// 7-day unlimited free trial, then a $2.99/month subscription.
// Trial starts when an account is created (profiles.trial_started_at).

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export const TRIAL_DAYS = 7;
export const PRICE_MONTHLY = "$2.99";

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
      const { data } = await supabase.auth.getUser();
      const user = data.user ?? null;
      if (!active) return;

      if (!user) {
        setState({
          loading: false,
          user: null,
          isSubscribed: false,
          trialStartedAt: null,
          daysLeft: 0,
          hasAccess: false,
        });
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("trial_started_at, is_subscribed")
        .eq("id", user.id)
        .maybeSingle();
      if (!active) return;

      const trialStartedAt = profile?.trial_started_at ?? null;
      const isSubscribed = profile?.is_subscribed ?? false;
      const daysLeft = trialDaysLeft(trialStartedAt);

      setState({
        loading: false,
        user,
        isSubscribed,
        trialStartedAt,
        daysLeft,
        hasAccess: isSubscribed || daysLeft > 0,
      });
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
