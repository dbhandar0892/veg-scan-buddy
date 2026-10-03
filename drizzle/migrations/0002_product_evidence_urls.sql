ALTER TABLE public.products ADD COLUMN IF NOT EXISTS evidence_urls text[] NOT NULL DEFAULT '{}';
UPDATE public.products SET verification = 'community',
  explanation = regexp_replace(explanation, 'Company confirms (this is )?', 'Independent sources say ', 'g')
WHERE verification = 'manufacturer';