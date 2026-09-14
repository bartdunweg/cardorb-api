-- A card's sheet out of the copy (Bart, 2026-09-14: every page reads our own store, the sources
-- only at night).
--
-- The sheet read TCGdex's card record on every open, the five Western catalogues for which
-- languages a card was printed in, TCGdex's set record for its era and GraphQL for that era's
-- rarities. The nightly copy already asks TCGdex one GraphQL question per set; these are the
-- answers it now keeps from that question, plus the set's printed languages and its serie.

alter table public.catalogue_cards
  add column if not exists illustrator text,
  add column if not exists hp integer,
  add column if not exists stage text,
  add column if not exists evolve_from text,
  add column if not exists regulation_mark text,
  add column if not exists first_edition boolean,
  -- TCGdex's variants_detailed, trimmed to what printingsOf() reads: type, foil, stamp. Null until
  -- the copy has been past the card since this migration, which is how a reader knows to ask TCGdex.
  add column if not exists variants jsonb,
  -- The Western languages the card was printed in, in WESTERN order. Null: nobody could say.
  add column if not exists languages text[];

-- TCGdex's serie id ("base", "sv"): the era a set belongs to, for its foil rule and its rarities.
alter table public.catalogue_sets add column if not exists serie_id text;

create index if not exists catalogue_sets_serie_idx on public.catalogue_sets (serie_id);

-- Which shape of copy a set was last written in. A set below the current format is copied again
-- ahead of the up-to-date ones, the way a set whose card count moved is (mirror.ts).
alter table public.catalogue_sync add column if not exists format integer not null default 0;

-- Every rarity the era of one set printed, out of the copy. What era-rarities.ts asked TCGdex's
-- GraphQL for, two questions per sheet.
create or replace function public.catalogue_era_rarities(p_set_id text)
returns text[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(distinct c.rarity order by c.rarity), '{}')
  from public.catalogue_sets s
  join public.catalogue_sets era on era.serie_id = s.serie_id
  join public.catalogue_cards c on c.set_id = era.id
  where s.id = p_set_id and s.serie_id is not null and c.rarity is not null;
$$;

revoke all on function public.catalogue_era_rarities(text) from public, anon, authenticated;
grant execute on function public.catalogue_era_rarities(text) to service_role;
