-- Two more printings a copy can be: the Poké Ball and Master Ball reverse holos of 151 and
-- Prismatic Evolutions (TCGdex: a reverse variant with foil "pokeball" / "masterball").
-- Both are reverse holos with a pattern, so they are priced as a reverse holo is: the foil
-- fields when Cardmarket publishes them, the plain ones otherwise. Cardmarket lists the
-- ball versions as products of their own at their own price; that price is not read yet.
alter table public.cards drop constraint if exists cards_finish_check;
alter table public.cards
  add constraint cards_finish_check
    check (finish is null or finish in ('normal', 'reverse-holo', 'holo', 'poke-ball', 'master-ball'));

comment on column public.cards.finish is
  'Which printing this copy is: normal, reverse-holo, holo, poke-ball or master-ball. Null means not '
  'recorded and is priced as normal; see the 20260816200000 migration for why that is not the same as ''normal''.';
