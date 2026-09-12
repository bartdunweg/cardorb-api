-- The binders made by 20260912120000 were made by hand, and a binder filled by hand holds only
-- what somebody files in it: they said "0 cards" where the Pokédex they replaced showed the whole
-- collection. A Pokédex fills itself, so it gets the rule that says so: the range it already
-- draws, or every Pokémon where it draws them all.
--
-- The rarities stay out of the rule on purpose. In a Pokédex setting they decide which slots turn
-- green, not which cards the binder holds, and a rule would throw the other cards out of it.
update public.collections
set rule = jsonb_build_object(
  'dex',
  jsonb_build_object(
    'from', coalesce((pokedex -> 'dex' ->> 'from')::int, 1),
    'to', coalesce((pokedex -> 'dex' ->> 'to')::int, 1025)
  )
)
where pokedex is not null and rule is null;
