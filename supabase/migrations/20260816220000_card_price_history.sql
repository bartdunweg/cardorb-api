-- What a card was worth, week by week, so a collection can say what moved.
--
-- ── Why there is no user_id on this table ──────────────────────────────────
--
-- Because a price is a fact about a card, not about a person. Two people who
-- hold the same Charizard hold the same price, and storing it twice would mean
-- the table grows with accounts rather than with the catalogue — and that the
-- two copies could disagree.
--
-- The same reasoning the collection already applies in the other direction:
-- lib/core/catalogue.ts caches card facts once, globally, under a key with
-- nobody's name in it, while lib/core/collection.ts caches rows per user. This
-- is the first *stored* thing on that side of the line.
--
-- The size argument follows from it. Per user, weekly, this collection alone
-- would write ~1,900 rows a week and every new account would add its own.
-- Per card it is ~1,600 rows a week no matter how many people sign up:
-- roughly 83,000 rows and about 5 MB a year, for everybody.
--
-- ── Who may read it ───────────────────────────────────────────────────────
--
-- Signed-in callers, and that is a deliberate middle. The prices themselves are
-- public — Cardmarket publishes them daily and anyone can download the guide.
-- What is not worth publishing is the *set of tcg_ids in here*, which is the
-- union of every collection this deployment tracks: for a private account that
-- would say which cards exist somewhere without saying whose. Requiring a
-- session costs nothing real and keeps that out of an anonymous scrape.
--
-- Writes have no policy at all, so only the service role can make them, which
-- is the weekly cron and nothing else. See adminClient() in lib/storage/supabase.ts.
create table if not exists public.card_prices (
  -- TCGdex's id ("swsh12-184"), which is the only stable handle a card has
  -- across the three catalogues. Not a foreign key: this table is about cards
  -- in general, and a row may outlive anybody holding that card.
  tcg_id        text not null,
  snapshot_date date not null,

  -- Cents, like collection_value_snapshots, and for the same reason: the
  -- rounding to euros is a display decision and does not belong at rest.
  --
  -- `market` rather than the Near Mint estimate. Movement is the honest
  -- comparison between two of Cardmarket's own figures; putting the NM band on
  -- both sides would multiply both by the same constant and change nothing
  -- except the ability to check the arithmetic against the source.
  market_cents  integer check (market_cents is null or market_cents >= 0),
  -- The foil printing, where Cardmarket prices one separately. Null where it
  -- does not — 865 of this collection's 1,526 products publish no foil price,
  -- and null is not zero. See holoPriceOf() in lib/core/price-basis.mjs.
  holo_cents    integer check (holo_cents is null or holo_cents >= 0),

  created_at    timestamptz not null default now(),

  -- One reading per card per day, and the target the cron upserts onto.
  primary key (tcg_id, snapshot_date)
);

-- The one query there is: "these cards, since this date". The primary key
-- already leads with tcg_id, so this covers the date-first half of it for a
-- sweep across many cards at once.
create index if not exists card_prices_date_idx on public.card_prices (snapshot_date desc);

alter table public.card_prices enable row level security;

drop policy if exists card_prices_read on public.card_prices;
create policy card_prices_read on public.card_prices for select
  using (auth.uid() is not null);
