-- A set is recorded when the copy holds its cards, and these four hold none.
--
-- `cards_recorded` says whether the catalogue lists a set's cards or only the set and its count.
-- The shelf reads it (copiedLanguageSets) and the set page reads it (languageSetFromCopy, which
-- answers null for a recorded set with no cards). The column defaults to true and the English
-- nightly run never wrote it at all (mirror.ts, writeCatalogueSetRecord), so a set TCGdex publishes
-- with `cards: []` was inserted with the flag on an empty shelf (measured 2026-09-20, read-only):
--
--   jumbo  Jumbo cards         0 of 160
--   rc     Radiant Collection  0 of 25   (Legendary Treasures' RC run; its cards are in bw11)
--   sp     Sample              0 of 10
--   wp     W Promotional       0 of 7
--
-- The English shelf happens to leave them off a tile today, but by a second and unrelated rule:
-- copiedEnglishSets() drops a set whose sync record counts zero cards. Two rules that must agree
-- for the shelf to be right is one too many, and only one of them holds the set page.
--
-- From now on both runs write the flag from the cards they wrote: `pictured.length > 0` on the
-- English one (mirror.ts, which is where these four came from) and `(set.cardsRecorded ||
-- fromTcgplayer) && resolved.length > 0` on the Japanese one (mirror-language.ts, which wrote the
-- catalogue's claim). data-health's "A recorded set holds a card" counts the rest. This corrects the four rows that are already there; a set whose cards arrive later gets
-- the flag back on its next run.
update public.catalogue_sets s
   set cards_recorded = false
 where s.cards_recorded
   and not exists (
     select 1
       from public.catalogue_cards c
      where c.language = s.language
        and c.set_id = s.id
   );
