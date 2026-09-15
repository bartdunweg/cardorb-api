-- Undo a backfill run on 2026-09-15 that took the wrong mode. `backfill-card-prices.mjs --daily
-- --ids ...` was meant to fill 73 newly linked English cards; `--daily` without `--only daily` is
-- the old all-cards pass, which ignores `--ids`. It ran from 08:08 to 08:22 UTC over 2024-02-08 to
-- 2024-03-20 for every English card before it was stopped. It wrote only rows under two retired
-- printing names, and touched no existing row (checked 2026-09-15):
--   * `market`: 35,871 rows (February 17,862, March 18,009)
--   * `holo`:   19,437 rows (February 9,699, March 9,738)
-- No row under either name existed before the run, and nothing else was written in that window,
-- so every row it wrote goes. A second run changes nothing.
delete from public.card_price_months
where printing in ('market', 'holo')
  and updated_at >= timestamptz '2026-09-15 08:00:00+00'
  and updated_at <  timestamptz '2026-09-15 08:30:00+00';
