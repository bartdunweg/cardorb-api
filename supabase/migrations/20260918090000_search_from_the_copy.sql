-- Card search answered by the copy alone, ranked the way the browser's own document ranks it.
--
-- The copy has held every English and Japanese card since #326, and the search already read it
-- (mirror.ts, searchMirror). Three things spoiled that:
--
-- 1. "Is there a copy?" was a count of catalogue_sync, not of catalogue_cards. A database whose
--    cards are loaded any other way (the end-to-end stack seeds catalogue_sets and
--    catalogue_cards and no sync row) answered "no copy" and asked TCGdex per keystroke; with
--    outside hosts blocked, as the e2e job blocks them, the palette said "The card service
--    didn't answer." about a catalogue in the same database. Read in postgres.ts now.
-- 2. The copy's own order was release_date first, so what was typed had no say in what came
--    back first. The browser's copy of the catalogue has ranked by the name since #656
--    (cardorb-web, lib/name-rank.ts): what the name starts with, then what a word inside it
--    starts with, then the rest. Anyone whose document did not load got the other order from
--    the API. The same bands are worked out here now.
-- 3. A name with a diacritic was findable only by typing the diacritic: "poke ball" found none
--    of the 159 English cards whose name carries one, "Poké Ball" among them. The browser's
--    document had the same gap.

-- ── The fold ──────────────────────────────────────────────────────────────────────────────────
-- Latin letters with a diacritic to the letter itself, so "poke" finds "Poké Ball" and "pokemon"
-- finds "Pokémon Center Lady". Japanese and the ☆/★ the search column already spells out as
-- "star" are untouched: neither is in the map.
--
-- IMMUTABLE and built from pg_catalog alone, because the index below stores what it returns.
-- That is also why it must never be redefined in place: a changed fold means a new function name
-- and a new index, or the index holds text the query no longer asks for. Postgres enforces half
-- of that itself, by refusing to drop a function an index depends on.
create or replace function public.search_fold(t text) returns text
language sql
immutable
strict
parallel safe
as $$
  select pg_catalog.translate(
    pg_catalog.lower(t),
    'áàâäãåéèêëíìîïóòôöõúùûüýÿñç',
    'aaaaaaeeeeiiiiooooouuuuyync'
  )
$$;

comment on function public.search_fold(text) is
  'Lowercases and drops Latin diacritics. catalogue_cards_search_folded_idx stores its result, so a change means a new function and a new index.';

-- ── The index ─────────────────────────────────────────────────────────────────────────────────
-- The trigram index the search had, over the folded text instead of the raw. Built before the old
-- one is dropped, so nothing is unindexed in between; it is the same shape over the same rows, so
-- the database ends this migration the size it started (405 MB of 480 on 2026-09-18, peaking at
-- about 415 MB while both indexes exist).
create index if not exists catalogue_cards_search_folded_idx
  on public.catalogue_cards using gin (public.search_fold(search) extensions.gin_trgm_ops);

-- Nothing reads the unfolded column through an index any more: search_catalogue_cards below is
-- its only reader, and it folds.
drop index if exists public.catalogue_cards_search_idx;

-- ── The search ────────────────────────────────────────────────────────────────────────────────
-- One page of hits and the exact number of them, in one query.
--
-- Dynamic SQL rather than a fixed predicate, because the number of words is the person's and
-- because a literal pattern is what lets the trigram index answer a `like`: a word arriving in a
-- parameter array cannot be turned into trigrams by the planner. Every value goes through
-- format()'s %L.
--
-- The bands are cardorb-web's `band()`, on the name with its hyphens read as spaces:
--   0  the name starts with the word            ("charizard" → Charizard ex)
--   1  a word inside the name starts with it    ("charizard" → Dark Charizard)
--   2  it sits inside a word of the name        ("char" → Pecharunt ex)
--   3  it is not in the name at all: the row matched on the number, the set name, the set id or
--      the name the card prints in its own language
-- and a card takes the best band any typed word reaches, so "base charizard" is a Charizard.
-- Within a band the order every other list in this repository uses: newest set first, then the
-- set, then the number as a binder holds it.
--
-- A hyphen reads as a space on both sides, which is the one thing cardorb-web's comment already
-- claimed this side did and it did not: "shaymin ex" found Shaymin-EX in the browser's document
-- and not through the API. The caller splits the typed words on hyphens; the bands below read
-- the name with its own hyphens as spaces.
--
-- A word of three characters or more that is a set's id also matches every card of that set, so
-- "sv03.5 charizard" is the 151 Charizards. Three, not two, because a two-character id is far
-- more often part of a name. Those cards band 3, so they sit under every name match either way.
--
-- The set's printed code (SVI, PAL, MEW) is deliberately not read this way, though the box would
-- read nicer if it were. Counted on the English copy, 2026-09-18: "mew" is 151's code and 152
-- cards have Mew in the name, "pal" is Paldea Evolved's and 119 do, "tri" is Triumphant's and
-- 261 do, "ros", "meg", "par" and "gen" the same. Each of those would answer a name with a set,
-- and the count above the list would say 355 cards for "mew". A set is named by the set chip and
-- by the set field, which are exact, and by its name, which is in the search text already; the
-- code is the one spelling that cannot be told apart from a Pokémon.
create or replace function public.search_catalogue_cards(
  p_language  text,
  -- The typed words, each already folded and lowercased by the caller, hyphens split out.
  p_words     text[],
  p_name      text,
  p_number    text,
  p_set       text,
  p_type      text,
  p_full_art  boolean,
  p_limit     int,
  p_offset    int
)
returns table (
  id text,
  set_id text,
  local_id text,
  name text,
  set_name text,
  series text,
  release_date text,
  rarity text,
  types text[],
  image text,
  category text,
  trainer_type text,
  full_art boolean,
  local_name text,
  total_count bigint
)
language plpgsql
stable
security invoker
set search_path = public, extensions
as $$
declare
  -- The name as the bands read it: folded, and its hyphens spaces.
  spelled constant text := 'replace(public.search_fold(c.name), ''-'', '' '')';
  conditions text[] := array[format('c.language = %L', p_language)];
  banded text[] := '{}';
  ranked text[];
  word text;
  set_ids text[];
  rank_expr text;
  sql text;
begin
  if p_full_art then
    conditions := conditions || 'c.full_art';
  end if;
  -- The fielded fields fold too, so "poke ball" in the name box finds Poké Ball exactly as it
  -- does in the one box. They match their own column rather than the search text, which is what
  -- makes them precise, and that is unchanged.
  if coalesce(p_name, '') <> '' then
    conditions := conditions
      || format('public.search_fold(c.name) like %L', '%' || public.search_fold(p_name) || '%');
  end if;
  if coalesce(p_number, '') <> '' then
    conditions := conditions || format('c.local_id ilike %L', '%' || p_number || '%');
  end if;
  if coalesce(p_set, '') <> '' then
    conditions := conditions
      || format('public.search_fold(c.set_name) like %L', '%' || public.search_fold(p_set) || '%');
  end if;
  if coalesce(p_type, '') <> '' then
    conditions := conditions || format('c.types @> array[%L]::text[]', p_type);
  end if;

  foreach word in array coalesce(p_words, '{}'::text[]) loop
    if word = '' then
      continue;
    end if;
    -- The sets this word names outright. Read here rather than handed in, so one round trip still
    -- answers the whole search; catalogue_sets is a few hundred rows behind its key.
    if length(word) >= 3 then
      select array_agg(s.id) into set_ids
      from catalogue_sets s
      where s.language = p_language and lower(s.id) = word;
    else
      set_ids := null;
    end if;

    if set_ids is null then
      conditions := conditions
        || format('public.search_fold(c.search) like %L', '%' || word || '%');
    else
      conditions := conditions
        || format(
             '(public.search_fold(c.search) like %L or c.set_id = any (%L::text[]))',
             '%' || word || '%',
             set_ids
           );
    end if;
    banded := banded || word;
  end loop;

  -- With a chip on, the palette sends the typed term as the name field and no words at all; it is
  -- still what was typed, so it still decides the bands.
  ranked := case when array_length(banded, 1) is null and coalesce(p_name, '') <> ''
                 then array[replace(public.search_fold(p_name), '-', ' ')]
                 else banded end;

  if array_length(ranked, 1) is null then
    rank_expr := '3';
  else
    rank_expr := 'least(' || array_to_string(
      (select array_agg(
         format(
           'case when %1$s like %2$L then 0 when %1$s ~ %3$L then 1 when %1$s like %4$L then 2 else 3 end',
           spelled,
           w || '%',
           -- A word starts after a space or a punctuation mark, as cardorb-web's band() reads it;
           -- the hyphen is already a space on both sides by here.
           '[ ''’.:(]' || regexp_replace(w, '([\\^$.|?*+()\[\]{}])', '\\\1', 'g'),
           '%' || w || '%'
         )
       )
       from unnest(ranked) as w), ', ') || ')';
  end if;

  sql := format(
    'select c.id, c.set_id, c.local_id, c.name, c.set_name, c.series, c.release_date, c.rarity,'
    || ' c.types, c.image, c.category, c.trainer_type, c.full_art, c.local_name,'
    || ' count(*) over () as total_count'
    || ' from catalogue_cards c where %s'
    || ' order by %s, c.release_date desc nulls last, c.set_id, c.number_order'
    || ' limit %s offset %s',
    array_to_string(conditions, ' and '),
    rank_expr,
    greatest(coalesce(p_limit, 20), 0),
    greatest(coalesce(p_offset, 0), 0)
  );

  return query execute sql;
end;
$$;

comment on function public.search_catalogue_cards is
  'One page of the catalogue copy for a search, banded by the name as cardorb-web ranks it, with the exact total on every row.';

revoke all on function public.search_catalogue_cards(
  text, text[], text, text, text, text, boolean, int, int
) from public;
grant execute on function public.search_catalogue_cards(
  text, text[], text, text, text, text, boolean, int, int
) to service_role;
