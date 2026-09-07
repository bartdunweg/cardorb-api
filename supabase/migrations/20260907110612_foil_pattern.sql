-- What the foil on a copy looks like, beside `finish`, which says what it is worth.
--
-- Those are two questions and they had one column. `finish` chooses between the two price
-- series Cardmarket publishes — the plain figures and the `-holo` ones — which is why it holds
-- five values and not three: poke-ball and master-ball are foil patterns that were put in a
-- pricing list because Cardmarket prices those two apart.
--
-- Every other pattern has no price of its own. A Cosmos Holo Rare and a plain Holo Rare of the
-- same card are one product to Cardmarket, one figure. Adding them to `finish` would mean
-- choosing a price series for each, and either choice is invented money — on a column the
-- value history in snapshot.ts is built from.
--
-- So the pattern lives here. Nullable, because it is unknown for every row that came from
-- Notion and for every card added by hand; null means "not recorded", never "plain".
--
-- The five values are the ones a real export actually names (Dex, 2026-09-07). poke-ball and
-- master-ball are deliberately absent: `finish` already says so for those, and a fact written
-- in two columns is a fact that drifts.
alter table public.cards
  add column if not exists foil_pattern text;

alter table public.cards drop constraint if exists cards_foil_pattern_check;
alter table public.cards
  add constraint cards_foil_pattern_check
    check (
      foil_pattern is null
      or foil_pattern in ('cosmos', 'cracked-ice', 'starlight', 'confetti', 'vertical-line')
    );

comment on column public.cards.foil_pattern is
  'What the foil on this copy looks like: cosmos, cracked-ice, starlight, confetti or '
  'vertical-line. Null means not recorded. Says nothing about price — that is finish. The ball '
  'patterns are not here because finish already carries them.';
