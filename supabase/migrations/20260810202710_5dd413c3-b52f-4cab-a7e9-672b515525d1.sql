update public.products
set status = 'unknown',
    confidence = 0.5,
    verification = 'unverified',
    explanation = 'This product contains cheese, but it is not yet confirmed whether the cheese is made using vegetarian or animal rennet.'
where status in ('vegetarian','vegan')
  and verification <> 'manufacturer'
  and coalesce(ingredients_text,'') ~* '(cheese|parmesan|romano|asiago|pecorino|gruy)'
  and coalesce(ingredients_text,'') !~* '(vegan|plant[- ]?based|suitable for vegetarians|microbial rennet|vegetable rennet|vegetarian rennet|chymosin)';