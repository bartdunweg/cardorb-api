-- One more printing a copy can be: the Energy Symbol reverse holo of Ascended Heroes, which
-- TCGplayer sells as a product of its own ("Pikachu (Energy Symbol Pattern)", 140 cards, measured
-- 2026-09-14) at its own price, beside the set's Poké Ball, Friend Ball, Love Ball, Quick Ball and
-- Dusk Ball reverses. Like poke-ball and master-ball it is a reverse holo with a pattern, priced
-- from its own product (the printing energy-symbol-reverse-holofoil) and as a plain reverse where
-- that has no figure.
alter table public.cards drop constraint if exists cards_finish_check;
alter table public.cards
  add constraint cards_finish_check
    check (finish is null or finish in ('normal', 'reverse-holo', 'holo', 'poke-ball', 'master-ball', 'energy-symbol'));

comment on column public.cards.finish is
  'Which printing this copy is: normal, reverse-holo, holo, poke-ball, master-ball or energy-symbol. '
  'Null means not recorded and is priced as normal; see the 20260816200000 migration for why that is not the same as ''normal''.';
