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

-- 2. Crown Zenith's Galarian Gallery is "Galarian Gallery", every card of it (Bart's call). A copy's
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

-- 3. A Trainer Gallery card is Ultra Rare where a catalogue gave it a sub-tier word (Silver Tempest's
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
