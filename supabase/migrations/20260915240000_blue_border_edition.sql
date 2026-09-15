-- My First Battle's Blue Border print is a run of its own: the four starters and the four basic
-- energies came again with a blue border, and TCGplayer sells each as a product beside the plain
-- card (Pikachu $17.56, Pikachu (Blue Border) $29.58 on 2026-09-15). A copy records it in
-- `edition`, as Base Set's Shadowless run is recorded.

comment on column public.cards.edition is
  'Which print run a copy is from: 1st-edition, shadowless, unlimited, blue-border. Null where nobody has said; not a synonym for unlimited.';

alter table public.cards drop constraint if exists cards_edition_check;
alter table public.cards add constraint cards_edition_check
  check (edition is null or edition = any (array['1st-edition'::text, 'shadowless'::text, 'unlimited'::text, 'blue-border'::text]));
