-- TCGplayer's lowest listing comes back, as a fallback only: a printing with no market figure is
-- written with its lowest asking price instead (Bart, 2026-09-18). Market stays the price wherever
-- it exists, and a row holds one of the two, never both.
--
-- Migration 20260914120000 dropped `low`, which was written beside every market figure and never
-- decided a figure on screen. The cron skipped every printing without a market figure, so a card
-- listed and never sold had no price at all: the R/G/B Mew of 30th Celebration (products 717607 to
-- 717609, $6,790 to $9,000 asked on 2026-09-18). tcgcsv publishes `lowPrice` beside `marketPrice`;
-- on 2026-09-18, 819 of 45,465 English printings and 6,428 of 28,943 Japanese ones had a listing
-- and no market figure.
--
-- Storage: those rows only, about 7,250, at about 165 bytes a row with the key's index (the table
-- was 11 MB for 67,466 rows): some 1.2 MB. A market row's `listing` is null and costs nothing: the
-- null bitmap fits in the row header's padding. The history (card_price_months) takes no listing.
--
-- The code that writes and reads `listing` deploys beside this migration and copes with either
-- order: a write that finds no column drops the listing rows and writes the market figures, a
-- read that finds none reads the market figures alone.
alter table public.tcgplayer_prices alter column market drop not null;

alter table public.tcgplayer_prices add column if not exists listing numeric(12, 2);

alter table public.tcgplayer_prices drop constraint if exists tcgplayer_prices_one_figure;
alter table public.tcgplayer_prices
  add constraint tcgplayer_prices_one_figure check ((market is null) <> (listing is null));

comment on column public.tcgplayer_prices.market is 'TCGplayer''s market figure for the printing, in dollars. Null only where it publishes none and the row holds the lowest listing.';
comment on column public.tcgplayer_prices.listing is 'TCGplayer''s lowest listing for the printing, in dollars, only where it publishes no market figure. Shown labelled as a listing, never summed into a value.';
comment on table public.tcgplayer_prices is 'TCGplayer''s latest market figure per product and printing, or its lowest listing where it has no market figure, in dollars, written daily from tcgcsv. A copy, never the truth: TCGplayer is.';
