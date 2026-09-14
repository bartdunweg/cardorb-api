-- The Japanese catalogue in the same copy as the English one (Bart, 2026-09-14: every set, card and
-- price the same way, out of our own store).
--
-- A row is now a card of one catalogue: `language` beside the id, and the key is the pair. Not the
-- id alone, because the two catalogues share ids: neo4-100 to neo4-113 are cards of Neo Destiny in
-- both, and neo1 to neo4 are set ids in both (TCGdex, 2026-09-14). Every row already here is English,
-- which is what the default says.
--
-- `local_name` is what the card or set itself says where `name` is the English the app shows
-- (card-names.ts, set-names.ja.json); null on every English row. `cards_recorded` is whether the
-- catalogue lists the set's cards or only the set, and `sort_order` the shelf's own order for a
-- catalogue whose sets carry no dates on its shelf.

alter table public.catalogue_sets add column if not exists language text not null default 'en';
alter table public.catalogue_cards add column if not exists language text not null default 'en';
alter table public.catalogue_sync add column if not exists language text not null default 'en';

alter table public.catalogue_sets drop constraint if exists catalogue_sets_pkey;
alter table public.catalogue_sets add primary key (language, id);
alter table public.catalogue_cards drop constraint if exists catalogue_cards_pkey;
alter table public.catalogue_cards add primary key (language, id);
alter table public.catalogue_sync drop constraint if exists catalogue_sync_pkey;
alter table public.catalogue_sync add primary key (language, set_id);

alter table public.catalogue_cards add column if not exists local_name text;
alter table public.catalogue_sets
  add column if not exists local_name text,
  add column if not exists cards_recorded boolean not null default true,
  add column if not exists sort_order integer;

-- The free search matches the printed name too, so a Japanese card is found by リザードン as well
-- as by Charizard. Rebuilt because a generated column's expression cannot be altered in place.
drop index if exists public.catalogue_cards_search_idx;
alter table public.catalogue_cards drop column if exists search;
alter table public.catalogue_cards
  add column search text generated always as (
    lower(name || ' ' || local_id || ' ' || set_name || coalesce(' ' || local_name, ''))
  ) stored;
create index if not exists catalogue_cards_search_idx
  on public.catalogue_cards using gin (search extensions.gin_trgm_ops);

drop index if exists public.catalogue_cards_set_idx;
create index if not exists catalogue_cards_set_idx on public.catalogue_cards (language, set_id);
drop index if exists public.catalogue_sets_serie_idx;
create index if not exists catalogue_sets_serie_idx on public.catalogue_sets (language, serie_id);

-- The era's rarities within one catalogue: Japanese serie ids (SV, SM, XY) are not English ones.
drop function if exists public.catalogue_era_rarities(text);
create or replace function public.catalogue_era_rarities(p_set_id text, p_language text default 'en')
returns text[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(distinct c.rarity order by c.rarity), '{}')
  from public.catalogue_sets s
  join public.catalogue_sets era on era.language = s.language and era.serie_id = s.serie_id
  join public.catalogue_cards c on c.language = era.language and c.set_id = era.id
  where s.language = p_language and s.id = p_set_id
    and s.serie_id is not null and c.rarity is not null;
$$;

revoke all on function public.catalogue_era_rarities(text, text) from public, anon, authenticated;
grant execute on function public.catalogue_era_rarities(text, text) to service_role;
