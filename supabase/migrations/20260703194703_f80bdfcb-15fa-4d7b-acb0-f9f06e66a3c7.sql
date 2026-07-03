
ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS confidence NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS verification TEXT NOT NULL DEFAULT 'ai_generated',
  ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ NOT NULL DEFAULT now();

GRANT ALL ON public.ingredients TO service_role;
GRANT ALL ON public.products TO service_role;
