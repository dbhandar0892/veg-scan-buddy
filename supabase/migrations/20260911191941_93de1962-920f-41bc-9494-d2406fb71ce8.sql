ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trial_started_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS is_subscribed boolean NOT NULL DEFAULT false;

REVOKE UPDATE (is_subscribed) ON public.profiles FROM authenticated;