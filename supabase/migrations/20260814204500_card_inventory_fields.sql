-- Inventory facts about a printing, beyond the eight collection-row.ts always
-- had: how many, in what condition, bought for how much and when, any note,
-- and whether it is a favourite.
--
-- One row is already one printing — see the comment on public.cards in
-- 20260814062300_accounts_and_cards.sql, "OwnedCard.variants stays what it
-- always was: a derived thing, folded out of these rows at render time" — so
-- these columns need no new grouping to make sense: a quantity or a note
-- belongs to the exact row it is on, the same row acquired_at already does.
--
-- All seven are nullable or default to an inert value, so every existing row
-- reads the same as before this ran: quantity 1, is_favorite false, the rest
-- unset. Nothing here is required at insert time — the add-card form did not
-- ask for any of it before today, and a card added tomorrow without a
-- condition is not a card entered wrong, it is a card nobody has graded yet.
alter table public.cards
  add column if not exists quantity        integer not null default 1 check (quantity > 0),
  add column if not exists condition       text check (length(condition) <= 40),
  add column if not exists grade           text check (length(grade) <= 40),
  add column if not exists purchase_price  numeric check (purchase_price >= 0),
  add column if not exists purchase_date   date,
  add column if not exists notes           text check (length(notes) <= 2000),
  add column if not exists is_favorite     boolean not null default false;

-- No new RLS policy: cards_update/cards_read/cards_delete already read
-- `using (user_id = auth.uid())` with no column list, so they cover these the
-- moment they exist. A policy that named columns would have needed one; this
-- kind does not.
