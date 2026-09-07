-- Where a reading came from. The table was born on Cardmarket's daily guide and
-- every row said so by omission; the backfill (scripts/backfill-card-prices.mjs)
-- adds readings from before the guide was recorded here, taken from TCGplayer
-- and turned into euros at that day's ECB rate. A reader that wants to know
-- which half of a line is the market it shows can ask; the line itself does not.
alter table public.card_prices
  add column if not exists source text not null default 'cardmarket'
    check (source in ('cardmarket', 'tcgplayer', 'tcgplayer-sales'));
comment on column public.card_prices.source is
  'cardmarket: the daily price guide, in euros. tcgplayer: TCGplayer''s market price (tcgcsv.com archive), dollars turned into euros at the day''s ECB rate. tcgplayer-sales: weekly average of TCGplayer sales (tcgdex/price-history), likewise converted.';
