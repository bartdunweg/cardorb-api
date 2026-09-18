-- A set's printed code (SVI, PAL, MEW, OBF) names the set in the search box, and never costs a
-- name its place.
--
-- 20260918090000 left the code out on purpose: a bare code clashes with names. Counted on the
-- English copy, 2026-09-18: "mew" is 151's code and 152 cards have Mew in the name, "pal" is
-- Paldea Evolved's and 101 names start with it (Palkia), "ex" is Expedition's and the suffix of
-- 1,458 names. The owner asked for the codes anyway, so they are read in the one way that leaves
-- every name search as it was:
--
-- 1. The code beside other words narrows to its set ("pal 123", "svi 001", "mew charizard"),
--    unless a card matching every word holds the code as a whole word of its name, or the set
--    holds no card the other words find. The first keeps "charizard ex", "mew ex", "pal pad" and
--    "mt coronet" name searches: a Charizard ex has "ex" as a word of its name, and no Palkia has
--    "pal" as one. The second keeps a search the code reading would empty: "dp pikachu" is the
--    DP16 promo as before, because Diamond & Pearl (DP) has no Pikachu.
-- 2. The code alone ("svi", "pal", "mew") also takes its set's cards. They rank after every card
--    whose name starts with the code or holds a word that does, and before a name that holds it
--    inside a word ("bs" in Absol) or a card that matched it somewhere else (a set name, a
--    number). Where no name starts with the code ("svi", "bs"), that is the set's cards first;
--    where one does ("mew", "tri", "pal"), the names keep the top and the set follows.
--
-- The code is catalogue_sets.abbreviation, the fact api#552's consensus rule decides. Two sets can
-- carry one code (Brilliant Stars and its Trainer Gallery are both BRS, 30th Celebration and its
-- Classic Collection both 30C), and a code names every set that carries it. The Japanese shelf
-- carries no abbreviation; there a set's id is the code it prints (SV2a, S8b, S8), so the id is
-- read as the code.
--
-- The function is in no index, so replacing it in place is all this takes, and the answer's shape
-- (the columns the iOS app reads through the API) is unchanged.

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
  -- What every row must be, before a word: the shelf and the fielded fields.
  fielded text[] := array[format('c.language = %L', p_language)];
  conditions text[];
  words text[] := '{}';
  matchings text[] := '{}';
  banded text[] := '{}';
  ranked text[];
  word text;
  matching text;
  set_ids text[];
  code_sets text[];
  bare_code text[];
  as_name boolean;
  rank_expr text;
  sql text;
begin
  if p_full_art then
    fielded := fielded || 'c.full_art';
  end if;
  -- The fielded fields fold too, so "poke ball" in the name box finds Poké Ball exactly as it
  -- does in the one box. They match their own column rather than the search text, which is what
  -- makes them precise, and that is unchanged.
  if coalesce(p_name, '') <> '' then
    fielded := fielded
      || format('public.search_fold(c.name) like %L', '%' || public.search_fold(p_name) || '%');
  end if;
  if coalesce(p_number, '') <> '' then
    fielded := fielded || format('c.local_id ilike %L', '%' || p_number || '%');
  end if;
  if coalesce(p_set, '') <> '' then
    fielded := fielded
      || format('public.search_fold(c.set_name) like %L', '%' || public.search_fold(p_set) || '%');
  end if;
  if coalesce(p_type, '') <> '' then
    fielded := fielded || format('c.types @> array[%L]::text[]', p_type);
  end if;

  -- Each word as text: in the search column, or the set it is the id of.
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

    /* Under three characters the fold is paid for and buys nothing (20260918110000): a trigram
       index cannot answer a pattern that short, so a short word is matched as stored. */
    matching := case
      when length(word) < 3 then format('c.search like %L', '%' || word || '%')
      else format('public.search_fold(c.search) like %L', '%' || word || '%')
    end;
    if set_ids is not null then
      matching := format('(%s or c.set_id = any (%L::text[]))', matching, set_ids);
    end if;
    words := words || word;
    matchings := matchings || matching;
  end loop;

  -- Then each word again, as a set's printed code where it is one.
  conditions := fielded;
  for i in 1 .. coalesce(array_length(words, 1), 0) loop
    -- A Japanese set carries no abbreviation in the copy: its id is the code it prints (S8b, SV2a),
    -- two characters included (S8, S9), which the id rule above leaves to the text.
    select array_agg(s.id order by s.id) into code_sets
    from catalogue_sets s
    where s.language = p_language
      and lower(coalesce(s.abbreviation, case when s.language <> 'en' then s.id end)) = words[i];

    if code_sets is null then
      conditions := conditions || matchings[i];
      banded := banded || words[i];
    elsif array_length(words, 1) = 1 then
      -- The code alone: its set's cards join what the text finds, ranked below the names.
      conditions := conditions
        || format('(%s or c.set_id = any (%L::text[]))', matchings[i], code_sets);
      banded := banded || words[i];
      bare_code := code_sets;
    else
      -- The code beside other words: the set, unless a card that every word finds as text holds
      -- the code as a whole word of its name ("charizard ex", "mew ex", "pal pad").
      execute format(
        'select exists (select 1 from catalogue_cards c where %s and %s ~ %L)',
        array_to_string(fielded || matchings, ' and '),
        spelled,
        '(^|[^a-z0-9])' || regexp_replace(words[i], '([\\^$.|?*+()\[\]{}])', '\\\1', 'g')
          || '($|[^a-z0-9])'
      ) into as_name;
      -- And the set must hold a card the other words find, or the code reading answers nothing
      -- where the text did: "dp pikachu" is the DP promo, Diamond & Pearl has no Pikachu.
      if not as_name then
        execute format(
          'select not exists (select 1 from catalogue_cards c where %s)',
          array_to_string(
            fielded
              || matchings[:i - 1]
              || format('c.set_id = any (%L::text[])', code_sets)
              || matchings[i + 1:],
            ' and '
          )
        ) into as_name;
      end if;
      if as_name then
        conditions := conditions || matchings[i];
        banded := banded || words[i];
      else
        -- A word that named a set is no part of a name, so it has no say in the bands.
        conditions := conditions || format('c.set_id = any (%L::text[])', code_sets);
      end if;
    end if;
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
           'case when %1$s like %2$L then 0 when %1$s ~ %3$L then 1 %4$s end',
           spelled,
           w || '%',
           -- A word starts after a space or a punctuation mark, as cardorb-web's band() reads it;
           -- the hyphen is already a space on both sides by here.
           '[ ''’.:(]' || regexp_replace(w, '([\\^$.|?*+()\[\]{}])', '\\\1', 'g'),
           case when bare_code is null
             then format('when %s like %L then 2 else 3', spelled, '%' || w || '%')
             -- A bare code: its set's cards right after the names that start with it or hold a
             -- word that does (a clash, "mew"), and before a name that holds it inside a word
             -- ("bs" in Absol) or a card that matched it anywhere else.
             else format(
               'when c.set_id = any (%L::text[]) then 2 when %s like %L then 3 else 4',
               bare_code, spelled, '%' || w || '%'
             )
           end
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
  'One page of the catalogue copy for a search, banded by the name as cardorb-web ranks it, a set''s printed code read as the set where no name holds it, with the exact total on every row.';

revoke all on function public.search_catalogue_cards(
  text, text[], text, text, text, text, boolean, int, int
) from public;
grant execute on function public.search_catalogue_cards(
  text, text[], text, text, text, text, boolean, int, int
) to service_role;
