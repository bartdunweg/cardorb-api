-- The scan a card was last seen with, kept on the row.
--
-- `image_url` has been on the table since August and nothing has read it since the import that
-- filled it: the picture is worked out afresh on every read, from the set catalogue. That is
-- right while the catalogue answers, and on 2026-09-12 it did not: one flaky answer for set 151
-- left every card of it without a picture, for every client, until the entry aged out.
--
-- So the row remembers. The catalogue still says what a card is and still wins whenever it
-- answers; this is what the last answer was, for the minutes it is silent. `image_high_url` is
-- the second half of it, which the column pair was missing.
alter table public.cards
  add column if not exists image_high_url text;

comment on column public.cards.image_url is 'The low scan the catalogue last gave for this card. A remembered answer, never a hand-kept fact: the catalogue wins whenever it answers.';
comment on column public.cards.image_high_url is 'The high scan the catalogue last gave for this card. See image_url.';

-- The anonymous role already reads image_url (20260902200000); the public page draws the high
-- scan too, so it reads the other half of the same answer. Re-granting is a no-op.
grant select (image_url, image_high_url) on public.cards to anon;
