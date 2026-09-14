-- The price history says which catalogue a card id is from (2026-09-15). Part one of two.
--
-- card_price_months was keyed on (tcg_id, printing, month), and English and Japanese catalogue ids
-- collide: neo1 to neo4 are set ids in both, and neo4-100 to neo4-113 are cards in both (neo4-106 is
-- Shining Celebi in English and Lucky Stadium in Japanese). Three slips on 2026-09-14 came of it:
-- Japanese Chansey's figure written into Shining Celebi's line, a clean-up that nearly deleted
-- Shining Celebi's whole history, and Japanese readings under English ids. The writers carried
-- guards for it; the table could not tell. From here the language is part of the key, as it is for
-- catalogue_cards and catalogue_sets (20260914235000).
--
-- Which rows are Japanese, read-only on 2026-09-15 (1,296,003 rows, 35,912 ids):
--   21,020 ids (1,057,277 rows) are cards of the English catalogue only: English.
--   14,878 ids (237,952 rows) are cards of the Japanese catalogue only: Japanese. None of them is
--          in the English TCGplayer map (tcgplayer-ids.generated.json), and every one is in the
--          Japanese map or carries catalogue_cards.tcgplayer_product_id, which is what the Japanese
--          price job and backfill write from. Their history starts in December 2024 at the
--          earliest, where the Japanese archive does.
--   14 ids (774 rows) are cards of both, neo4-100 to neo4-113: English. Every one of their
--          printings is one the English product sells (1st-edition and unlimited for 100 to 105,
--          1st-edition-holofoil and unlimited-holofoil for 106 to 113, all priced in
--          tcgplayer_prices under products 86893 to 89171), their history starts in February 2024
--          with the English archive, no Japanese product is linked to any of them (not in the
--          Japanese map, no tcgplayer_product_id), and the one Japanese reading that was written
--          under one (neo4-106 `normal`) went in 20260915010000.
--   0 ids are in neither catalogue.
-- So no row is ambiguous. Any row that has become so by the time this runs stops the migration
-- rather than being guessed: an id in neither catalogue, or an id in both with a printing other than
-- those four.
--
-- Size, on a free plan with a 500 MB database (443.5 MB on 2026-09-15; card_price_months 368.6 MB:
-- heap 261.7, primary key 84.1, month index 22.7). A column added with a constant default is written
-- into no existing row (Postgres keeps the default beside the table), and the Japanese rows are
-- updated in place before any index includes the column, so the heap's free space (about 80 MB,
-- 171,338 dead tuples) takes them. The primary key cannot change columns in place, and building the
-- new one beside the old would peak at about 505 MB; so this part drops the old key and the month
-- index, which frees 107 MB when it commits, and part two (20260915161500) builds the new key
-- (estimated 57 MB packed) and the month index again. `supabase db push` runs each file in its own
-- transaction, so the database never holds both keys: about 400 MB after, never above where it
-- started. Between the two files the table has no unique key for as long as it takes to start part
-- two: a price write in that moment fails and is retried (writeCardPrices, the backfill), and reads
-- go on.
--
-- Idempotent: the column and the constraint are added once, the update only touches English rows
-- that are Japanese, and the old key is dropped only while it is the key without the language.

alter table public.card_price_months add column if not exists language text not null default 'en';

do $$
declare
  stray text;
begin
  select string_agg(distinct m.tcg_id, ', ') into stray
  from public.card_price_months m
  where not exists (select 1 from public.catalogue_cards k where k.id = m.tcg_id);
  if stray is not null then
    raise exception 'card_price_months ids in no catalogue, language unknown: %', stray;
  end if;

  select string_agg(distinct m.tcg_id || ' ' || m.printing, ', ') into stray
  from public.card_price_months m
  where exists (select 1 from public.catalogue_cards k where k.language = 'ja' and k.id = m.tcg_id)
    and exists (select 1 from public.catalogue_cards k where k.language = 'en' and k.id = m.tcg_id)
    and m.printing not in ('1st-edition', 'unlimited', '1st-edition-holofoil', 'unlimited-holofoil');
  if stray is not null then
    raise exception 'card_price_months rows on an id of both catalogues, language unknown: %', stray;
  end if;
end
$$;

update public.card_price_months as m
set language = 'ja'
where m.language = 'en'
  and exists (select 1 from public.catalogue_cards k where k.language = 'ja' and k.id = m.tcg_id)
  and not exists (select 1 from public.catalogue_cards k where k.language = 'en' and k.id = m.tcg_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.card_price_months'::regclass
      and conname = 'card_price_months_language_check'
  ) then
    alter table public.card_price_months
      add constraint card_price_months_language_check check (language in ('en', 'ja')) not valid;
  end if;
end
$$;
alter table public.card_price_months validate constraint card_price_months_language_check;

drop index if exists public.card_price_months_month_idx;

do $$
begin
  if exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.card_price_months'::regclass
      and c.contype = 'p'
      and not exists (
        select 1 from pg_attribute a
        where a.attrelid = c.conrelid and a.attnum = any (c.conkey) and a.attname = 'language'
      )
  ) then
    alter table public.card_price_months drop constraint card_price_months_pkey;
  end if;
end
$$;
