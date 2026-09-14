-- The price archive keeps every day for the last six months and one figure a week before that.
--
-- Bart, 2026-09-14: daily figures for the last six months, weekly before. A chart over years reads
-- the same at one point a week, and the free plan's database is 500 MB. Measured on this database:
-- 804,193 rows of card_price_months fall in the 25 months older than six months; thinning a full
-- month's cents array to its Saturdays takes it from 148 to 52 bytes, about 73 MB in all. Postgres
-- reuses that space for the table's next rows; the file itself does not shrink without
-- `vacuum full`, so database_size_bytes() stays where it is and the room shows as slower growth.
--
-- The tcgplayer-prices cron thins three months a night (thin_oldest_price_month), the oldest not yet
-- thinned, so no single run holds a long lock or outlives the function's time limit.
--
-- Only source = 'tcgplayer' rows are thinned. The months start at February 2024, the first day of
-- tcgcsv's archive: nothing older stays in the table (20260914160000 removes the sales averages).
--
-- A backfill that sends a thinned month again fills its days back in, because
-- upsert_card_price_months merges (merge_price_days keeps every day either side has), and the
-- month is not thinned twice. So scripts/backfill-card-prices.mjs must not re-send months older
-- than six months.

create table if not exists public.card_price_months_thinned (
  -- The first of a month whose rows were thinned to one figure a week.
  month      date primary key,
  -- How many rows the thinning changed.
  rows       integer not null,
  thinned_at timestamptz not null default now()
);

-- Service role only: no policy, so nobody else reads or writes it.
alter table public.card_price_months_thinned enable row level security;

-- A month's cents with one reading per week left: per Sunday to Saturday week whose Saturday falls
-- in this month, the last reading in that week, which is the Saturday when there is one. A week
-- whose Saturday is in the next month belongs to the next month's row, so its days here go.
-- Checked read-only on live rows: March 2025 kept Sat 01, 08, 15, 22, 29; a gappy June 2025 row
-- kept Sat 07 and Tue 10, where Sat 14 had no reading.
create or replace function public.weekly_price_days(p_month date, p_cents integer[])
returns integer[]
language sql
immutable
set search_path = ''
as $$
  select array(
    select case
      when p_cents[d] is not null
       and (p_month + (d - 1) + (6 - extract(dow from p_month + (d - 1))::int)) < (p_month + interval '1 month')
       and not exists (
         select 1 from generate_series(d + 1, 31) e
         where p_cents[e] is not null
           and (p_month + (e - 1)) < (p_month + interval '1 month')
           and (p_month + (e - 1)) <= (p_month + (d - 1) + (6 - extract(dow from p_month + (d - 1))::int))
       )
      then p_cents[d] end
    from generate_series(1, 31) d
  )
$$;

-- Thins the earliest p_months months before p_before that are not thinned yet, each updated and
-- recorded on its own, and returns one row per month thinned (which, and how many rows changed).
-- No row when every such month is done. The cron asks for three a night, so the 25 months behind
-- (February 2024 to February 2026 on 2026-09-14) take nine nights.
create or replace function public.thin_oldest_price_month(p_before date, p_months integer default 1)
returns table(month date, rows integer)
language plpgsql
set search_path = ''
as $$
#variable_conflict use_column
declare
  target date;
  changed integer;
begin
  for i in 1..greatest(coalesce(p_months, 1), 0) loop
    target := null;
    select m::date into target
    from generate_series('2024-02-01'::date, p_before - interval '1 month', interval '1 month') as m
    where m::date < p_before
      and not exists (
        select 1 from public.card_price_months_thinned t where t.month = m::date
      )
    order by m
    limit 1;

    exit when target is null;

    update public.card_price_months as c
    set cents = public.weekly_price_days(c.month, c.cents),
        updated_at = now()
    where c.month = target
      and c.source = 'tcgplayer'
      and public.weekly_price_days(c.month, c.cents) is distinct from c.cents;
    get diagnostics changed = row_count;

    insert into public.card_price_months_thinned as t (month, rows)
    values (target, changed);

    month := target;
    rows := changed;
    return next;
  end loop;
end
$$;

revoke all on function public.weekly_price_days(date, integer[]) from public, anon, authenticated;
revoke all on function public.thin_oldest_price_month(date, integer) from public, anon, authenticated;
grant execute on function public.weekly_price_days(date, integer[]) to service_role;
grant execute on function public.thin_oldest_price_month(date, integer) to service_role;
