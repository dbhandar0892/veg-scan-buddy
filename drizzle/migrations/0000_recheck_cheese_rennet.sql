update public.products set status='not_vegetarian', verification='community',
 explanation='Contains parmesan made with animal rennet. Not vegetarian. Sargento states its Parmesan is made with animal-derived enzymes.'
 where id='ba6f2e02-c6c7-4bd0-ad11-2af2ac87c322';
update public.products set status='unknown', verification='unverified',
 explanation='This product contains cheese, but the manufacturer does not specify whether the cheese is made using vegetarian or animal rennet.'
 where status in ('vegetarian','vegan')
 and id <> 'ba6f2e02-c6c7-4bd0-ad11-2af2ac87c322'
 and (name ilike '%cheese%' or name ilike '%parmesan%' or name ilike '%romano%' or name ilike '%pecorino%' or name ilike '%mozzarella%' or name ilike '%cheddar%' or ingredients_text ilike '%cheese%' or ingredients_text ~* '\menzymes?\M')
 and not (coalesce(name,'')||' '||coalesce(ingredients_text,'')) ~* '(vegan|plant[- ]?based|dairy[- ]?free|vegetarian|microbial|non[- ]?animal rennet|vegetable rennet|fpc)';