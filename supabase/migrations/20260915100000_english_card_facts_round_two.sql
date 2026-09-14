-- The third pass over the English card facts (Bart, 2026-09-14): what the API now reads through
-- card-fact-corrections.ts, moved into what is stored. The catalogue copy itself is rewritten by the
-- nightly run (CATALOGUE_FORMAT 3); this is the part a night does not reach.

-- 1. A gold star card is named "Mewtwo ☆" in the copy, and the free search still finds it by
--    "star". Rebuilt because a generated column's expression cannot be altered in place (as in
--    20260914235000_catalogue_languages.sql).
drop index if exists public.catalogue_cards_search_idx;
alter table public.catalogue_cards drop column if exists search;
alter table public.catalogue_cards
  add column search text generated always as (
    lower(
      replace(replace(name, '☆', '☆ star'), '★', '★ star')
      || ' ' || local_id || ' ' || set_name || coalesce(' ' || local_name, '')
    )
  ) stored;
create index if not exists catalogue_cards_search_idx
  on public.catalogue_cards using gin (search extensions.gin_trgm_ops);

-- 2. A binder's rule and a Pokédex setting that kept a Galarian Gallery or Trainer Gallery copy under
--    its old word keep it under the new one. Runs before the copies are respelled below. Each old
--    word adds the new one beside it (never replaces it), so a setting keeps everything it had.
--    A Pokédex entry may carry a split ("Ultra Rare / v", "/ ex", "/ other", read off the card's
--    name), and the added entry names the split the gallery's cards under that word fall in: every
--    Galarian Gallery Secret Rare is a VSTAR, so "Secret Rare" adds "Galarian Gallery / v". Only for
--    an account holding a copy of that gallery, so a setting of someone without one is untouched.
--    Idempotent: an entry already there is not added twice.
--    Counted on 2026-09-14: 1 Pokédex setting holds rarities (the owner's: "Ultra Rare / v" and
--    "Secret Rare" add "Galarian Gallery / v"; nothing of its Trainer Gallery words), 0 binder rules
--    hold rarities. Run on a copy of the live rows in PGlite and read with the web's rarityKept
--    (folder-rule.ts): the owner's Pokédex kept 43 of its gallery copies before and 50 after, none
--    lost; the 7 gained are Silver Tempest's Trainer Gallery V cards, Ultra Rare now, which
--    "Ultra Rare / v" names. A second run changes nothing.
create temporary table gallery_words (gallery text, old text, split text, added text);
insert into gallery_words (gallery, old, split, added) values
  -- Crown Zenith's Galarian Gallery.
  ('gg', 'ultra rare', null, 'Galarian Gallery'),
  ('gg', 'ultra rare', 'v', 'Galarian Gallery / v'),
  ('gg', 'ultra rare', 'ex', 'Galarian Gallery / ex'),
  ('gg', 'ultra rare', 'other', 'Galarian Gallery / other'),
  ('gg', 'secret rare', null, 'Galarian Gallery / v'),
  ('gg', 'secret rare', 'v', 'Galarian Gallery / v'),
  ('gg', 'rare', null, 'Galarian Gallery / other'),
  ('gg', 'holo rare', null, 'Galarian Gallery / other'),
  ('gg', 'trainer gallery holo rare', null, 'Galarian Gallery / other'),
  ('gg', 'trainer gallery ultra rare', null, 'Galarian Gallery / v'),
  ('gg', 'trainer gallery secret rare', null, 'Galarian Gallery / v'),
  -- The Sword & Shield Trainer Galleries.
  ('tg', 'holo rare v', null, 'Ultra Rare / v'),
  ('tg', 'holo rare vmax', null, 'Ultra Rare / v'),
  ('tg', 'holo rare vstar', null, 'Ultra Rare / v'),
  ('tg', 'full art trainer', null, 'Ultra Rare / other'),
  ('tg', 'holo rare', null, 'Ultra Rare / other'),
  ('tg', 'rare', null, 'Ultra Rare / other'),
  ('tg', 'trainer gallery holo rare', null, 'Ultra Rare / other'),
  ('tg', 'trainer gallery ultra rare', null, 'Ultra Rare / v'),
  ('tg', 'trainer gallery ultra rare', null, 'Ultra Rare / other'),
  ('tg', 'trainer gallery secret rare', null, 'Secret Rare');

create temporary table gallery_holders as
select distinct user_id,
  case when tcg_id ~ '^swsh12(\.5|pt5)gg-' then 'gg' else 'tg' end as gallery
from cards
where (tcg_id ~ '^swsh12(\.5|pt5)gg-' or tcg_id ~ '^swsh(9|10|11|12)tg-')
  and coalesce(language, '') <> 'ja';

-- The list with every added entry after it, in order, once each. `splits` says whether entries
-- carry a split (a Pokédex) or are plain words (a binder rule, where "Ultra Rare / v" is "Ultra Rare").
create or replace function pg_temp.with_gallery_words(list jsonb, owner uuid, splits boolean)
returns jsonb language sql stable as $$
  with entries as (
    select e.value, e.ordinality
    from jsonb_array_elements_text(list) with ordinality as e(value, ordinality)
  ),
  added as (
    select case when splits then w.added else split_part(w.added, ' / ', 1) end as value,
      min(e.ordinality) + 0.5 as ordinality
    from entries e
    join gallery_words w
      on w.old = lower(trim(split_part(e.value, ' / ', 1)))
     and w.split is not distinct from nullif(lower(trim(split_part(e.value, ' / ', 2))), '')
    where exists (select 1 from gallery_holders h where h.user_id = owner and h.gallery = w.gallery)
    group by 1
  )
  select coalesce(jsonb_agg(to_jsonb(v.value) order by v.ordinality), '[]'::jsonb)
  from (
    select value, ordinality from entries
    union all
    select a.value, a.ordinality from added a
    where not exists (select 1 from entries e where lower(e.value) = lower(a.value))
  ) v
$$;

update collections
set pokedex = jsonb_set(pokedex, '{rarities}', pg_temp.with_gallery_words(pokedex->'rarities', user_id, true))
where jsonb_typeof(pokedex->'rarities') = 'array'
  and pg_temp.with_gallery_words(pokedex->'rarities', user_id, true) <> pokedex->'rarities';

update collections
set rule = jsonb_set(rule, '{rarities}', pg_temp.with_gallery_words(rule->'rarities', user_id, false))
where jsonb_typeof(rule->'rarities') = 'array'
  and pg_temp.with_gallery_words(rule->'rarities', user_id, false) <> rule->'rarities';

-- 3. Crown Zenith's Galarian Gallery is "Galarian Gallery", every card of it (Bart's call). A copy's
--    rarity (cards.rarity) still holds the catalogue's older words: TCGdex's "Rare" and "Secret Rare",
--    and the "Trainer Gallery ..." words of an older import. Only those words move, so a rarity set
--    by hand stays. The copy's id is written both ways: swsh12.5gg and pokemontcg.io's swsh12pt5gg.
update cards
set rarity = 'Galarian Gallery'
where tcg_id ~ '^swsh12(\.5|pt5)gg-'
  and coalesce(language, '') <> 'ja'
  and rarity in (
    'Rare', 'Holo Rare', 'Ultra Rare', 'Secret Rare',
    'Trainer Gallery Holo Rare', 'Trainer Gallery Ultra Rare', 'Trainer Gallery Secret Rare'
  );

-- 4. A Trainer Gallery card is Ultra Rare where a catalogue gave it a sub-tier word (Silver Tempest's
--    "Holo Rare V", "Holo Rare VMAX", "Full Art Trainer", the old "Holo Rare" and "Rare", and the
--    import's "Trainer Gallery Holo Rare" and "Trainer Gallery Ultra Rare"), as TCGplayer grades
--    them. Its Secret Rares stay Secret Rare.
update cards
set rarity = 'Ultra Rare'
where tcg_id ~ '^swsh(9|10|11|12)tg-'
  and coalesce(language, '') <> 'ja'
  and rarity in (
    'Rare', 'Holo Rare', 'Holo Rare V', 'Holo Rare VMAX', 'Holo Rare VSTAR', 'Full Art Trainer',
    'Trainer Gallery Holo Rare', 'Trainer Gallery Ultra Rare'
  );

update cards
set rarity = 'Secret Rare'
where tcg_id ~ '^swsh(9|10|11|12)tg-'
  and coalesce(language, '') <> 'ja'
  and rarity = 'Trainer Gallery Secret Rare';
