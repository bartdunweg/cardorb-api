-- Every other named reverse pattern TCGplayer sells as a product of its own, each a printing a copy
-- can be (measured 2026-09-14 across the 220 English groups): Ascended Heroes' Friend Ball (23),
-- Love Ball (25), Quick Ball (22), Dusk Ball (26) and Team Rocket (10) reverses. Each is priced
-- from its own product as the printing friend-ball-reverse-holofoil and so on, like poke-ball,
-- master-ball and energy-symbol (20260915060000). Existing rows keep their values.
alter table public.cards drop constraint if exists cards_finish_check;
alter table public.cards
  add constraint cards_finish_check
    check (finish is null or finish in (
      'normal', 'reverse-holo', 'holo',
      'poke-ball', 'master-ball', 'energy-symbol',
      'friend-ball', 'love-ball', 'quick-ball', 'dusk-ball', 'team-rocket'
    ));

comment on column public.cards.finish is
  'Which printing this copy is: normal, reverse-holo, holo, or a patterned reverse TCGplayer sells '
  'apart (poke-ball, master-ball, energy-symbol, friend-ball, love-ball, quick-ball, dusk-ball, team-rocket). '
  'Null means not recorded and is priced as normal; see the 20260816200000 migration for why that is not the same as ''normal''.';
