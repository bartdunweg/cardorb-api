-- TCGplayer's lowest listing goes: a price in Card Orb is TCGplayer's market figure and nothing
-- else (Bart's call, 2026-09-14).
--
-- The column was written by the tcgplayer-prices cron beside the market figure and read into
-- every card's price as `low`, where it was shown only when a printing had no market figure. No
-- printing reached the table without one (the cron skips those), so it never decided a figure on
-- screen. The code stopped writing and reading it in the same change, and this runs after that
-- deploy (migrate.yml), so nothing asks for the column once it is gone.
alter table public.tcgplayer_prices drop column if exists low;

comment on table public.tcgplayer_prices is 'TCGplayer''s latest market figure per product and printing, in dollars, written daily from tcgcsv. A copy, never the truth: TCGplayer is.';
