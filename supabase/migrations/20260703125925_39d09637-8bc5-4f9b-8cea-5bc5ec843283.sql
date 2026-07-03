
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE public.ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  aliases TEXT[] NOT NULL DEFAULT '{}',
  category TEXT NOT NULL CHECK (category IN ('plant','animal','microbial','mineral','synthetic','unknown')),
  vegan BOOLEAN,
  vegetarian BOOLEAN,
  source TEXT,
  explanation TEXT NOT NULL,
  e_number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ingredients_aliases_idx ON public.ingredients USING GIN (aliases);
CREATE INDEX ingredients_ename_idx ON public.ingredients (e_number) WHERE e_number IS NOT NULL;
GRANT SELECT ON public.ingredients TO anon, authenticated;
GRANT ALL ON public.ingredients TO service_role;
ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ingredients are public" ON public.ingredients FOR SELECT USING (true);

CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barcode TEXT UNIQUE,
  name TEXT NOT NULL,
  brand TEXT,
  image_url TEXT,
  category TEXT,
  ingredients_text TEXT,
  status TEXT NOT NULL CHECK (status IN ('vegan','vegetarian','not_vegetarian','unknown')),
  confidence NUMERIC NOT NULL DEFAULT 0,
  explanation TEXT NOT NULL,
  ingredient_hits JSONB NOT NULL DEFAULT '[]'::jsonb,
  verification TEXT NOT NULL DEFAULT 'unverified' CHECK (verification IN ('unverified','community','manufacturer')),
  source TEXT,
  last_analyzed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX products_barcode_idx ON public.products (barcode);
CREATE INDEX products_name_trgm ON public.products USING GIN (name gin_trgm_ops);
GRANT SELECT ON public.products TO anon, authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Products are public" ON public.products FOR SELECT USING (true);
