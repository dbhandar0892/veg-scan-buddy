update public.ingredients set vegetarian = null, vegan = false, confidence = 0.6,
  explanation = 'Dairy cheese. Vegetarian only if made with microbial/vegetarian rennet; many cheeses use animal rennet, which is not vegetarian.'
where slug in ('cheese','blue-cheese');