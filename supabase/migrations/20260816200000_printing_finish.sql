-- Which printing a copy actually is, so a reverse holo can be priced as one.
--
-- Cardmarket publishes two price sets per product — the plain fields and their
-- `-holo` twins — and this collection could not use the second, because nothing
-- recorded which copy was which. 323 cards here are held as two rows, which is
-- almost always the normal printing and its reverse holo, and both were valued
-- at the normal price. Where a foil price exists at all it runs at a median of
-- twice the normal one, so this is not a rounding difference.
--
-- ── Why nullable, when "make them all normal" was the instruction ───────────
--
-- Because the information existed and was lost, rather than never having been
-- recorded. It was kept in `rarity` — the surviving evidence is two rows still
-- reading 'Reversed Holo' and two reading 'Non-holo', beside ten rows spelled
-- 'Illustration Rare' where the other 485 read 'Illustration rare'. The
-- backfill in ADR-0030 replaced that column with TCGdex's vocabulary, which
-- describes the card and not the copy, and its undo journal is matched by
-- .gitignore, so it was never committed and is gone.
--
-- Null therefore means "nobody has said", and it is priced as normal. That is
-- the same outcome as writing 'normal' into every row today, and it keeps the
-- one thing writing 'normal' would spend: an import that fills in the blanks
-- later — from Notion, where the original answers may still be — can tell a row
-- nobody has judged from a row somebody deliberately called normal. Filling
-- 1,969 rows with a confident answer nobody gave would make that impossible to
-- ever undo, which is the mistake being repaired here, made a second time.
--
-- The same distinction this codebase keeps making: an empty collection and an
-- unreachable one are different sentences.
alter table public.cards
  add column if not exists finish text
    check (finish is null or finish in ('normal', 'reverse-holo', 'holo'));

comment on column public.cards.finish is
  'Which printing this copy is. Null means not recorded and is priced as normal; '
  'see the 20260816200000 migration for why that is not the same as ''normal''.';
