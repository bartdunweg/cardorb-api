-- The day's dollar rate, kept beside the prices it converts.
--
-- Every TCGplayer price is in dollars and a collection is valued in euros. The rate was asked of
-- api.frankfurter.dev on requests (kept a day in the Data Cache), which put an outside host between
-- a person and their collection's value. The nightly price cron now reads the European Central
-- Bank's rate once and writes it here; requests read the latest day. One row a day, a few kilobytes
-- a year.
create table if not exists public.usd_eur_rates (
  day date primary key,
  -- Euros per dollar.
  rate numeric not null check (rate > 0),
  fetched_at timestamptz not null default now()
);

comment on table public.usd_eur_rates is 'Euros per dollar per day, written by the nightly TCGplayer price cron from frankfurter (ECB reference rate).';

-- Read and written by the service role only, like catalogue_sets: no grant to anon or authenticated.
alter table public.usd_eur_rates enable row level security;
