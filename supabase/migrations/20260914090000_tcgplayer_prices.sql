-- TCGplayer's latest figures, per product and printing, kept here so a collection reads a table
-- and not one request per card.
--
-- The collection priced every card by asking TCGdex for the card's record, which relays
-- TCGplayer's figures: 1,633 requests for the owner's collection, each kept a day. Every day, and
-- after every deploy that touched the set facts, the first screen paid them again: /cards took 7
-- to 12 seconds on a cold instance (measured 2026-09-14). tcgcsv publishes the same figures for
-- the whole shelf, one file per set, and the nightly snapshot already reads them for the price
-- history. So a cron writes the shelf in here once a day and the collection reads it.
--
-- Compared on 2026-09-14 over the owner's 1,564 resolvable cards: the printings and the product
-- ids are the same for every card both price, the market figure is identical on 68% of printings
-- and within 5% on 93% (TCGdex relays it a day or more late), and 187 cards TCGdex has no figure
-- for are priced here. None is priced by TCGdex and not here.
--
-- Dollars, as published. The collection converts at the day's rate, as it did.
--
-- A fact about a card, nobody's data: the service role only, like catalogue_cards.
create table if not exists public.tcgplayer_prices (
  product_id integer not null,
  -- TCGdex's spelling of TCGplayer's subtype ("reverse-holofoil", "1st-edition-holofoil"), the
  -- names every picker in tcgdex-client.ts reads.
  printing   text not null,
  market     numeric(12, 2) not null,
  low        numeric(12, 2),
  -- The day tcgcsv published this figure as current. A printing TCGplayer stops pricing is no
  -- longer written, and its row ages out of what the reader accepts.
  updated_on date not null,
  primary key (product_id, printing)
);

comment on table public.tcgplayer_prices is 'TCGplayer''s latest market and low per product and printing, in dollars, written daily from tcgcsv. A copy, never the truth: TCGplayer is.';

alter table public.tcgplayer_prices enable row level security;
