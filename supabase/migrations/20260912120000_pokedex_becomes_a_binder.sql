-- The Pokédex stops being a fixture and becomes a binder like any other, so the setting that
-- lived on the profile becomes a binder of its own. A profile that never touched the Pokédex
-- still saw one, with every Pokémon and the missing ones shown, so that is what it keeps.
--
-- Idempotent on purpose: run twice and the second run inserts nothing, because a profile that
-- already has a binder shown as a Pokédex is a profile this has already visited.
insert into public.collections (user_id, name, pokedex, is_public)
select
  p.id,
  'Pokédex',
  coalesce(p.pokedex, '{"missing": true}'::jsonb),
  coalesce(p.pokedex_public, false)
from public.profiles p
where not exists (
  select 1 from public.collections c where c.user_id = p.id and c.pokedex is not null
);
