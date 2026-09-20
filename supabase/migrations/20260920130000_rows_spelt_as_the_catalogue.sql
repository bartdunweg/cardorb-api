-- Every collection row spells its card as the catalogue copy does: the card's name, its set's name
-- and its printed number.
--
-- A row keeps those three beside the card's id, and the collection list, the CSV export and the
-- public profile read them straight off the row. They were written once, from what the client or
-- the imported file said, and the catalogue moved on without them. Measured 2026-09-20, read-only,
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
--   number   1,075 rows (51 the owner's, 1,024 other accounts')
--              the promo prefix the store used to strip ("168" for smp-SM168's "SM168", "020" for
--              SWSH020), a case fold ("77A" for xy6-77a's "77a"), and, on the other accounts, the
--              padding an import dropped ("36" for sv03.5-036's "036").
--
-- 1,309 rows move in all, over the two accounts that hold any: 239 of the owner's 1,946 and 1,070
-- of the other account's 2,097. (A row can drift in more than one column, so the three counts above
-- add up to more than that.)
--
-- Every one of these names the same card: the row's id is the copy's (migrations 20260915090000 and
-- 20260917120000), data-health holds every row to a card the copy has, and the 1,075 numbers all
-- fold to their card's (canonNumber). So the copy's spelling is taken outright. Only the three
-- columns move; nothing else of anybody's row is written, and a row whose id the copy has no card
-- for is left exactly as it is.
--
-- English only, as the rule is (catalogue-spelling.ts): a Japanese row is named in its own script,
-- where the copy's `local_name` and not `name` is what the card prints. No row resolves that way
-- today (0 of them join the Japanese catalogue).
--
-- From now on the write paths spell a new row this way (withCatalogueSpelling, on POST /v1/cards
-- and on the import) and data-health's "Every row spells its card as the catalogue does" counts
-- what drifts. Running this twice changes nothing; on a database without the copy it changes
-- nothing either.
update public.cards c
   set name = k.name,
       set_name = k.set_name,
       number = k.local_id
  from public.catalogue_cards k
 where k.language = 'en'
   and k.id = c.tcg_id
   and coalesce(c.language, 'en') <> 'ja'
   and (c.name is distinct from k.name
        or c.set_name is distinct from k.set_name
        or c.number is distinct from k.local_id);
