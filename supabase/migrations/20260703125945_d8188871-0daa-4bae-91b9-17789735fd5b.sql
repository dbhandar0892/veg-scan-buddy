
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;
DROP INDEX IF EXISTS public.products_name_trgm;
ALTER EXTENSION pg_trgm SET SCHEMA extensions;
CREATE INDEX products_name_trgm ON public.products USING GIN (name extensions.gin_trgm_ops);
