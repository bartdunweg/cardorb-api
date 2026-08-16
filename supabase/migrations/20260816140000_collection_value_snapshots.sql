-- What a collection was worth, one dated reading at a time.
--
-- Recorded rather than fetched, because nobody publishes the history:
-- Cardmarket's API answers with today's price and no series, and TCGdex' free
-- price-history repo is TCGplayer in dollars and stopped in June 2025.
-- scripts/snapshot-collection-value.mjs argues that at length and is the only
-- thing that writes here.
--
-- Until now it wrote a committed JSON file that the dashboard imported, which
-- meant every account on the deployment read one person's line under its own
-- "Collection value" tile — a new account with three cards was told it was up
-- €24,253 across 1,524 of them. That is the bug this table exists to close.
create table if not exists public.collection_value_snapshots (
  id            uuid primary key default gen_random_uuid(),

  -- Defaulted for the same reason cards.user_id is: an insert that forgets
  -- whose reading this is gets the caller's, and the policy below refuses it
  -- either way.
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,

  -- A date, not a timestamp. A reading is whatever Cardmarket published that
  -- morning, and the card that draws it prints months — a day is already more
  -- precision than the series honestly has. Named snapshot_date rather than
  -- date so no query has to quote a keyword.
  snapshot_date date not null,

  -- Cents. The script rounds to whole euros for its console line, and that
  -- rounding is a display decision which should not be the one the table
  -- remembers; the sum behind it is built from two-decimal Cardmarket rows.
  -- integer rather than bigint: this overflows somewhere north of €21M.
  value_cents   integer not null check (value_cents >= 0),

  -- How many copies were in the binder by that date, how many of them
  -- Cardmarket had a price for, and how many it did not.
  --
  -- unpriced is not noise worth hiding. In the December 2024 guide most of it
  -- is cards from sets that had not been printed yet, which is the honest
  -- reason an old point counts fewer, and the page should be able to say so.
  cards         integer not null default 0 check (cards >= 0),
  priced        integer not null default 0 check (priced >= 0),
  unpriced      integer not null default 0 check (unpriced >= 0),

  created_at    timestamptz not null default now(),

  -- One reading per person per day, and the target the script upserts onto:
  -- running it twice in a morning corrects the point rather than doubling it.
  -- It also serves the only read there is (by user, ordered by date), so there
  -- is no second index.
  unique (user_id, snapshot_date)
);

alter table public.collection_value_snapshots enable row level security;

-- Yours alone, with no public half at all — the shape imports and the old
-- connections table use, and deliberately not the shape cards uses.
--
-- cards_read has an `or exists (... p.is_public)` branch because /user/<name>
-- cannot render a stranger's collection without it, and stripPrices() then
-- removes the money card by card before it leaves the server. Neither applies
-- here: a value series is nothing but money, and being an aggregate it cannot
-- be stripped the way a card can. No public surface wants it — CardsView
-- already computes no stats at all on a public profile.
drop policy if exists value_snapshots_own on public.collection_value_snapshots;
create policy value_snapshots_own on public.collection_value_snapshots for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
