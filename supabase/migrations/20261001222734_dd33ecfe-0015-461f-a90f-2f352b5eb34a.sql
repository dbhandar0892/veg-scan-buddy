CREATE TABLE public.favorites (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id text NOT NULL,
  item jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.favorites TO authenticated;
GRANT ALL ON public.favorites TO service_role;
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own favorites select" ON public.favorites FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own favorites insert" ON public.favorites FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own favorites update" ON public.favorites FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own favorites delete" ON public.favorites FOR DELETE TO authenticated USING (auth.uid() = user_id);