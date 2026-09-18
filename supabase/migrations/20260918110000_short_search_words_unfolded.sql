-- A word too short to be indexed is matched as the column stores it.
--
-- 20260918090000 folded the search text at query time so a diacritic need not be typed, and that
-- is right for a word a trigram index can answer. Under three characters the index cannot answer
-- anything (pg_trgm needs three characters to make a trigram), so the whole shelf is read row by
-- row, and folding each row's search text is pure cost: measured on the live English copy,
-- 2026-09-18, "ho oh" took 129 ms folded and 16 ms as stored, for the same 38 hits. The words
-- that lose the fold are the ones that could never have carried a diacritic.
--
-- The function is not in an index, so replacing it in place is all this takes.

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
  matching text;
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

    /* Under three characters the fold is paid for and buys nothing: a trigram index cannot answer
       a pattern that short, so every row of the shelf is read either way, and folding each one
       costs 110 ms of the 130 a two-word term like "ho oh" took. A word that short with a
       diacritic in it does not exist. So a short word is matched against the column as stored,
       which is what every search did before 20260918090000 and is 16 ms. */
    matching := case
      when length(word) < 3 then format('c.search like %L', '%' || word || '%')
      else format('public.search_fold(c.search) like %L', '%' || word || '%')
    end;
    if set_ids is null then
      conditions := conditions || matching;
    else
      conditions := conditions
        || format('(%s or c.set_id = any (%L::text[]))', matching, set_ids);
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
