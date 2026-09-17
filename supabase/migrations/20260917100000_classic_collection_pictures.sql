-- 30th Classic Collection's 30 cards lose the pictures of 30th Celebration they were copied with,
-- and the set is worked out afresh by the next nightly copy (2026-09-17).
--
-- Both sets print 30C. Limitless's tpci/30C folder is 30th Celebration's run, and the nightly copy
-- guessed the Classic Collection's pictures in it by number: Charizard 30th-c-001 showed Exeggcute
-- 001/128, and all 30 were another card. The copy no longer guesses in a folder two sets share
-- (sharedSetCodes in artwork.ts).
--
-- The right pictures are TCGplayer's scans of group 24837 ("ME: 30th Celebration Classic
-- Collection"), one product per card, linked in tcgplayer-ids.generated.json. Charizard, Delcatty,
-- Metagross, Genesect-EX, Palkia, Darkrai & Cresselia (bottom), Lugia and Magikarp were opened and
-- are those cards with the 30 stamp; all 30 files answer 200. They are not in our bucket yet, and
-- only the copy puts them there, so the address cannot be written here: a null now draws the card's
-- name until then, and never another card.
--
-- The copy keeps any address of ours it already holds, so the wrong ones have to go before it runs.
-- And a set it has already copied asks nobody again about a card it holds no picture for, so the
-- set's sync row goes too: the set then reads as new, is copied first on the next run, and every
-- card goes through the fixed chain (TCGdex, which has no file, then TCGplayer by product).
--
-- Guarded on the wrong folder, so a second run, or a database without the copy, changes nothing.

update catalogue_cards
set image = null
where language = 'en'
  and set_id = '30th-c'
  and image like 'https://images.cardorb.com/limitless/tpci/30C/%';

delete from catalogue_sync
where language = 'en'
  and set_id = '30th-c'
  and exists (
    select 1 from catalogue_cards
    where language = 'en' and set_id = '30th-c' and image is null
  );
