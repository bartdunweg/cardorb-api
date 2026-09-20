-- Every collection row spells its card as the catalogue copy does: the card's name and its set's
-- name.
--
-- A row keeps those beside the card's id, and the collection list, the CSV export and the public
-- profile read them straight off the row. They were written once, from what the client or the
-- imported file said, and the catalogue moved on without them. Measured 2026-09-20, read-only,
-- over the 4,043 rows of all accounts that name a card the copy holds:
--
--   set name   193 rows (130 the owner's, 63 other accounts')
--              "Astral Radiance" for swsh10tg's "Astral Radiance Trainer Gallery", "Crown Zenith"
--              and "Crown Zenith: Galarian Gallery" for "Crown Zenith Galarian Gallery",
--              "Sword & Shield Promos" for "SWSH Black Star Promos". 17 distinct spellings.
--   name        90 rows (82 the owner's, 8 other accounts')
--              "Nidoran" for both "Nidoran♀" and "Nidoran♂", "Pokemon Breeder" for "Pokémon
--              Breeder", "Farfetch’d" for "Farfetch'd", "Mewtwo EX" for "Mewtwo-EX", "(Galarian)
--              Obstagoon" for "Galarian Obstagoon", one trailing space and one no-break space.
--
-- 275 rows move in all, over the two accounts that hold any: 208 of the owner's 1,946 and 67 of the
-- other account's 2,097. (A row can drift in both columns, so the two counts above add up to more.)
--
-- Not the printed number, although 1,075 rows spell one another way than the copy does (51 the
-- owner's, 1,024 the other account's). Those are the promo prefix the collection deliberately does
-- not store ("168" for smp-SM168's "SM168"), a case fold ("77A" for xy6-77a's "77a") and the zero
-- padding an import dropped ("36" for sv03.5-036's "036"). The column is held to that form by the
-- check constraint cards_number_no_promo_prefix (migration 20260912180000), the two spellings are
-- one number everywhere they meet (canonNumber), and changing it is the owner's rule to change.
--
-- Every row this does move names the same card: the row's id is the copy's (migrations
-- 20260915090000 and 20260917120000) and data-health holds every row to a card the copy has. So the
-- copy's spelling is taken outright. Only the two columns move; nothing else of anybody's row is
-- written, and a row whose id the copy has no card for is left exactly as it is.
--
-- Every row but a Japanese one, as the rule is (catalogue-spelling.ts). The guard is
-- `coalesce(c.language, 'en') <> 'ja'`, so a German or French copy of an English card takes that
-- card's spelling too, which is right: those catalogues share the English ids and set names, and
-- only Japanese has a catalogue of its own (cataloguesFor). A Japanese row is named in its own
-- script, where the copy's `local_name` and not `name` is what the card prints, and no row resolves
-- that way today (0 of them join the Japanese catalogue).
--
-- From now on the write paths spell a new row this way (withCatalogueSpelling, on POST /v1/cards
-- and on the import) and data-health's "Every row spells its card as the catalogue does" counts
-- what drifts. Running this twice changes nothing; on a database without the copy it changes
-- nothing either.
update public.cards c
   set name = k.name,
       set_name = k.set_name
  from public.catalogue_cards k
 where k.language = 'en'
   and k.id = c.tcg_id
   and coalesce(c.language, 'en') <> 'ja'
   and (c.name is distinct from k.name
        or c.set_name is distinct from k.set_name);
