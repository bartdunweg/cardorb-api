-- A folder may be shown as a Pokédex: its cards in the national order, one slot per Pokémon,
-- with two settings: whether the missing ones show, and the range a person collects. Any folder
-- may carry it; the built-in Pokédex is All cards with the profile's setting. The API validates
-- the shape (src/lib/core/collection/folders.ts); Postgres only insists on an object.
alter table public.collections add column if not exists pokedex jsonb;
alter table public.collections
  drop constraint if exists collections_pokedex_is_object,
  add constraint collections_pokedex_is_object
    check (pokedex is null or jsonb_typeof(pokedex) = 'object');
comment on column public.collections.pokedex is
  'Null for a plain list. Otherwise {missing: boolean, dex?: {from, to}}: shown as a Pokédex.';

alter table public.profiles add column if not exists pokedex jsonb;
alter table public.profiles
  drop constraint if exists profiles_pokedex_is_object,
  add constraint profiles_pokedex_is_object
    check (pokedex is null or jsonb_typeof(pokedex) = 'object');
comment on column public.profiles.pokedex is
  'How the built-in Pokédex shows for this person: {missing, dex?}. Null is every slot, missing ones too.';
