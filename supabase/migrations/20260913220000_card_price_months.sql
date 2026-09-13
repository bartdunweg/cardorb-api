-- Card prices per printing, a month to a row, so every English card can have every day on the free plan.
--
-- Bart, 2026-09-13: a price for every English card every day, back to 2024-02-08, per printing
-- ("ik wil liefst prijs per editie"). card_prices keeps one row per card per day, about 110 bytes
-- each after `vacuum full`, with one plain and one foil figure: every English card daily is some
-- 3.3 MB a night and gigabytes back to 2024. Here the card, the printing, the month and the row's
-- overhead are paid once and the days are an array of 31 cents, null where there was no reading.
-- Measured on this database: about 280 bytes a printing-month with its index entry; 21,023 English
-- cards have 34,869 printings, so about 115 MB a year and 260 MB back to 2024 (price-months.mjs).
--
-- This migration creates the table and the functions the API and the backfill write through, and
-- copies part of card_prices into it as the two series it had, the printings 'market' and 'holo':
-- the sales averages from before tcgcsv's archive (2024-02-08), which nothing can fill again, and
-- everything since the cron began (2026-08-16), so recent charts and movers read on. The weeks in
-- between are the weekly series, which `backfill-card-prices.mjs --only daily` writes again as every
-- day's real printings. Copying all of it while card_prices still exists would take the database
-- to about 475 MB of a 500 MB plan. card_prices is dropped by hand after this (`drop table
-- public.card_prices;`), and the daily backfill runs after that.

create table if not exists public.card_price_months (
  -- TCGdex's id, as card_prices had it. Not a foreign key: a price is a fact about a card.
  tcg_id     text not null,
  -- TCGplayer's printing as the app names it ("1st-edition-holofoil"), or 'market' / 'holo' for a
  -- reading from before printings were stored.
  printing   text not null,
  -- The first of the month.
  month      date not null check (extract(day from month) = 1),
  -- Cents, day 1 at index 1. Null where that day has no reading.
  cents      integer[] not null,
  -- 'tcgplayer', or 'tcgplayer-sales' for the weekly sales averages before tcgcsv's archive.
  source     text not null default 'tcgplayer',
  updated_at timestamptz not null default now(),
  primary key (tcg_id, printing, month)
);

create index if not exists card_price_months_month_idx on public.card_price_months (month);

alter table public.card_price_months enable row level security;

-- Read like card_prices: any signed-in person, since a price is nobody's. Written by the service role.
drop policy if exists card_price_months_read on public.card_price_months;
create policy card_price_months_read on public.card_price_months for select
  using ((select auth.uid()) is not null);

-- Two months of days laid over each other: a day the new one has wins, a day it lacks keeps the old.
create or replace function public.merge_price_days(fresh integer[], kept integer[])
returns integer[]
language sql
immutable
set search_path = ''
as $$
  select case
    when fresh is null then kept
    when kept is null then fresh
    else array(select coalesce(fresh[i], kept[i]) from generate_series(1, 31) as i)
  end
$$;

-- Months written as JSON rows ({tcg_id, printing, month, cents, source}), merged into what is stored.
-- A night sends months with one day filled; a backfill sends whole months. Neither can erase a day.
create or replace function public.upsert_card_price_months(p_rows jsonb)
returns void
language sql
set search_path = ''
as $$
  insert into public.card_price_months as m (tcg_id, printing, month, cents, source)
  select r.tcg_id, r.printing, r.month, r.cents, coalesce(r.source, 'tcgplayer')
  from jsonb_to_recordset(p_rows) as r(tcg_id text, printing text, month date, cents integer[], source text)
  on conflict (tcg_id, printing, month) do update set
    cents = public.merge_price_days(excluded.cents, m.cents),
    source = excluded.source,
    updated_at = now()
$$;

-- The cards with a reading on one day, for the backfill's "cards held now".
create or replace function public.card_ids_priced_on(p_date date)
returns setof text
language sql
stable
set search_path = ''
as $$
  select distinct tcg_id from public.card_price_months
  where month = date_trunc('month', p_date)::date
    and cents[extract(day from p_date)::int] is not null
$$;

revoke all on function public.upsert_card_price_months(jsonb) from public, anon, authenticated;
revoke all on function public.card_ids_priced_on(date) from public, anon, authenticated;
grant execute on function public.upsert_card_price_months(jsonb) to service_role;
grant execute on function public.card_ids_priced_on(date) to service_role;

-- The part of card_prices named above, as the printings 'market' and, where it differs, 'holo'.
-- Merged rather than inserted, so running it again after card_prices took more readings only adds.
insert into public.card_price_months as m (tcg_id, printing, month, cents, source)
select g.tcg_id, g.printing, g.month,
  array(select (g.days ->> i::text)::integer from generate_series(1, 31) as i),
  g.source
from (
  select tcg_id, 'market' as printing, date_trunc('month', snapshot_date)::date as month,
    jsonb_object_agg(extract(day from snapshot_date)::int, market_cents) as days,
    min(source) as source
  from public.card_prices
  where market_cents is not null
    and (snapshot_date < '2024-02-08' or snapshot_date >= '2026-08-16')
  group by 1, 2, 3
  union all
  select tcg_id, 'holo', date_trunc('month', snapshot_date)::date,
    jsonb_object_agg(extract(day from snapshot_date)::int, holo_cents),
    min(source)
  from public.card_prices
  where holo_cents is not null and holo_cents is distinct from market_cents
    and (snapshot_date < '2024-02-08' or snapshot_date >= '2026-08-16')
  group by 1, 2, 3
) as g
on conflict (tcg_id, printing, month) do update set
  cents = public.merge_price_days(excluded.cents, m.cents),
  updated_at = now();
