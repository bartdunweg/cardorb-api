-- A collection row spells its number as its card prints it, and the constraint that forbade that
-- goes.
--
-- Migration 20260920130000 gave every row its card's name and its set's name out of the catalogue
-- copy and left the number alone, because the check constraint cards_number_no_promo_prefix refused
-- the copy's spelling. The owner decided on 2026-09-20 that the printed number is the truth here
-- too, so the constraint goes first and the rows follow.
--
-- ── What the constraint was protecting ─────────────────────────────────────────────────────────
--
-- Migration 20260912180000 (#356) added it with one fault in hand: on 2026-08-16 a script wrote
-- TCGdex's localId "XY123" straight to Postgres, into a set whose 27 other rows said 110, 122, 124.
-- The set page sorted with parseInt, parseInt("XY123") is NaN, and Venusaur EX sank to the bottom
-- of its binder for a month. The same change replaced that parseInt with compareCardNumbers(), whose
-- numberKey() folds a promo prefix itself, so XY123 has sorted between 122 and 124 ever since,
-- whether its neighbours carry the prefix or not. The constraint was the belt beside that brace: a
-- script reaching the table without the code could not put the spelling back.
--
-- It is safe to drop because the thing it protected is decided elsewhere now, and because the
-- spelling it forbids is the one the rest of the app already uses:
--
--   sort        compareCardNumbers() folds the prefix (numberKey in src/lib/core/util.ts); the
--               collection, the set page and the binder order all go through it, and no parseInt
--               or ::int is applied to a row's number anywhere.
--   folding     fold_card() and split_card() compare through card_number_key() (migration
--               20260915220000), canonNumber() as SQL: read live, card_number_key('SM168') =
--               card_number_key('168') = '168', and '036' = '36' = '36', '77a' = '77A' = '77a'.
--               So no two rows fold differently after this than before.
--   matching    the catalogue lookup indexes every form of a number (numberForms, indexByNumber)
--               and the import matches folded (canonNumber), so an export and a re-import still
--               find the same row.
--   keys        no index, unique key or foreign key on public.cards includes `number` (read live:
--               cards_pkey, cards_user_set_idx, cards_user_acquired_idx, cards_source_idx,
--               cards_collection_id_idx). cards_number_check (length <= 40) still holds: the
--               longest local_id any row names is 7 characters.
--
-- A narrower constraint was considered and is not possible: what is now wanted is "the number equals
-- this card's local_id", which needs a look at another table, and a CHECK cannot. A trigger could,
-- at the cost of a catalogue read on every write of every row, an escape for the rows the copy has
-- no card for, and a grant that #573 has just taken away. The rule lives in the code
-- (withCatalogueSpelling) and is held by the data-health check "Every row spells its card as the
-- catalogue does", which counts every account and reads the number now.
--
-- ── What moves ─────────────────────────────────────────────────────────────────────────────────
--
-- 1,075 rows, over the two accounts that hold any: 51 of the owner's 1,946 and 1,024 of the other
-- account's 2,097 (measured 2026-09-20, read-only). Three kinds, all the same card either way:
--
--   the promo prefix the old form stripped   "168" becomes smp-SM168's "SM168", "020" becomes
--                                            swshp-SWSH020's "SWSH020"
--   a case fold the old form applied         "77A" becomes xy6-77a's "77a", "150A" becomes XY150a
--   the padding an import dropped            "36" becomes sv03.5-036's "036" (the other account)
--
-- Every row but a Japanese one, as the rule is: the guard is `coalesce(c.language, 'en') <> 'ja'`,
-- so a German or French copy of an English card takes that card's number too, which is right,
-- because those catalogues share the English ids and set names and only Japanese has one of its own
-- (cataloguesFor). A Japanese row's number is its own catalogue's, and no row resolves that way
-- today. A row whose id the copy has no card for is left exactly as it is, and
-- keeps being written through storedCardNumber(). Only `number` moves. Running this twice changes
-- nothing; on a database without the copy it changes nothing either.
alter table public.cards drop constraint if exists cards_number_no_promo_prefix;

update public.cards c
   set number = k.local_id
  from public.catalogue_cards k
 where k.language = 'en'
   and k.id = c.tcg_id
   and coalesce(c.language, 'en') <> 'ja'
   and c.number is distinct from k.local_id;
