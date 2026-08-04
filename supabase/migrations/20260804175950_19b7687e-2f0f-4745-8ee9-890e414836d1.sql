DELETE FROM products
WHERE explanation ILIKE '%Colour on its own can be plant-based%'
   OR explanation ILIKE '%The colour used in this product is%'
   OR explanation ILIKE '%can be plant-based — it%';