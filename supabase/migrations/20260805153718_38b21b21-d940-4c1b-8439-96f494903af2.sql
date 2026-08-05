DELETE FROM public.products
WHERE status = 'not_vegetarian'
  AND explanation ILIKE '%whey%'
  AND explanation ILIKE '%Not vegan or vegetarian%';