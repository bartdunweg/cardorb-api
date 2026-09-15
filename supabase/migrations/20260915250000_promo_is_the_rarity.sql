-- Every card of a promo set is a "Promo", and nobody sets a rarity by hand (Bart, 2026-09-15).
--
-- A promo prints a black star where another card prints its rarity symbol, and no source publishes
-- what kind of card a promo is. From 2026-09-12 the owner named that kind by hand (Illustration
-- Rare, Ultra Rare, read off the art) and the catalogues' "Promo" was dropped to make room for it;
-- read off the art that proved unreliable. The API writes "Promo" for every card of these sets now
-- (promo-sets.ts): the copy in writeCatalogueSet(), a collection row in createRow() and
-- createRows(). This moves what is already stored to the same word, and drops the era rarities
-- that were offered for naming a promo by hand.
--
-- The sets are TCGdex's ids, exactly the catalogue_sets whose name says promo on 2026-09-15. The
-- McDonald's sets and the others card-fact-corrections.ts calls "Promo" card by card are not
-- among them and are not touched.

create temporary table promo_sets (id text primary key);
insert into promo_sets (id) values
  ('basep'), ('np'), ('dpp'), ('hgssp'), ('bwp'), ('xyp'), ('smp'), ('swshp'), ('svp'), ('mep'),
  ('miscp'), ('wp'), ('M-P'), ('SV-P');

-- The copy, English and Japanese alike.
update catalogue_cards
set rarity = 'Promo'
where set_id in (select id from promo_sets)
  and rarity is distinct from 'Promo';

-- Every account's rows, by the set in the card's id: everything before the last dash, so SV-P-051
-- is in SV-P. A row with no card id has no set to go by and is left.
update cards
set rarity = 'Promo'
where tcg_id is not null
  and regexp_replace(tcg_id, '-[^-]*$', '') in (select id from promo_sets)
  and rarity is distinct from 'Promo';

-- A Pokédex that keeps only some rarities counted a promo by the kind named by hand. It keeps
-- counting it: "Promo" joins a list that has rarities in it and not that word already. A list
-- already at the twenty a setting may hold is left as it is.
update collections
set pokedex = jsonb_set(pokedex, '{rarities}', (pokedex->'rarities') || '["Promo"]'::jsonb)
where jsonb_typeof(pokedex->'rarities') = 'array'
  and jsonb_array_length(pokedex->'rarities') between 1 and 19
  and not exists (
    select 1
    from jsonb_array_elements_text(pokedex->'rarities') as e(value)
    where lower(trim(e.value)) = 'promo'
  );

-- The rarities an era printed, read by the card sheet for a card with no rarity to give. Nothing
-- asks for them any more.
drop function if exists public.catalogue_era_rarities(text, text);
