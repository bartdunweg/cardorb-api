-- The candidates for the market movers: the English printings whose price moved most, in euros, over
-- the days up to the latest price day (2026-09-23).
--
-- cardorb.com shows a visitor with no account the cards that moved most across the whole catalogue,
-- where a signed-in reader sees their own collection's movers (GET /api/v1/catalog/movers). Reading
-- every English line into the API to find them would be some twenty thousand cards' printings over
-- two months, megabytes a request on a 500 MB free-plan database. So Postgres narrows first: this
-- answers a few hundred candidates, and the API lays their lines out through the same reader every
-- chart uses (price-months.mjs daysFromMonths), where a figure one odd sale set is held over, then
-- ranks them and keeps ten each way (market-movers.ts). The ranking here is only the narrowing:
-- it is on the figures as TCGplayer sent them, before the stray rule, so a candidate the rule takes
-- out leaves its place to the next, which is why it answers far more than the ten a list shows.
--
-- The window ends on `p_until`, the latest price day, which the API passes (latestPriceDay in
-- collection.ts, the day every price cache is keyed on). It is told rather than found: the first
-- version counted down from the 31st with a look over the latest month for every day after the
-- last one written, eight passes over the month on the 23rd and thirty on the 1st. The latest price
-- day rather than today, because the nightly write is what moves the list, and a night it did not
-- run should leave last week's movers standing rather than an empty week. Only the months the
-- window touches are read, which the key (language, tcg_id, printing, month) serves: for a week,
-- this month and at most the one before.
--
-- Both arguments are held to something sane, though today only the API calls it, with seven days:
-- `p_days` to one to thirty-one, a month being the most two month rows a side can hold, and
-- `p_until` to no later than tomorrow (the price day is tcgcsv's UTC day, which can run ahead of the
-- database's clock by hours) and no earlier than 2000-01-01, the API's ALL_READINGS, before any
-- reading. A day in the past is only an older week and harms nothing, so it is not held tighter:
-- a bound on the clock would also make the fixed days in this function's test expire.
--
-- The floor: a printing at under a euro (100 cents) at either end of the window is no candidate.
-- The stray rule does not judge a line whose median is under 25 cents, since at that level five
-- times is TCGplayer's own rounding, so a four-cent card that one trade sent to two euros is the
-- figure it cannot see, and ranked by euros it would top a quiet week. The API holds the lines to
-- the same number (MARKET_MOVER_FLOOR_CENTS). The two agree but for one rare case: this floor is on
-- the figures as stored, so a real mover whose first day in the window is a stray sale under a euro
-- is left out here, before the stray rule would have held that day with the figure before it. That
-- costs the list at most a place, taken by the next mover.
--
-- 'market' and 'holo' are the two series from before printings were stored (LEGACY in
-- price-months.mjs), not printings, and every row a recent window reads has real ones.
--
-- security invoker, set search_path = '', and executable by the service role alone. The API reads it
-- through the service role for a caller with no account, as it reads card_price_months for one
-- (getCardPrices, reader "nobody"); that role passes RLS by and keeps its grant on the table, so
-- running as the owner would buy nothing, and would turn a grant to `anon` made by mistake one day
-- into a road past RLS. `anon` gets none: with the anon key every browser carries, it would put the
-- catalogue's prices on PostgREST, past the API's limiter. Nor `authenticated`: nothing reads it as
-- the caller.

-- The first shape of this function, (p_days, p_limit), if a database ever took it before this file
-- settled: an overload beside the new one would answer a caller who left the day out.
drop function if exists public.market_mover_candidates(integer, integer);

create or replace function public.market_mover_candidates(
  p_until date,
  p_days integer default 7,
  p_limit integer default 200
)
returns table (
  tcg_id text,
  printing text,
  was_cents integer,
  now_cents integer,
  first_day date,
  last_day date,
  until_day date
)
language sql
stable
security invoker
set search_path = ''
as $$
  with bounds as (
    select
      least(greatest(coalesce(p_until, current_date), date '2000-01-01'), current_date + 1) as day,
      least(greatest(coalesce(p_days, 7), 1), 31) as days
  ),
  readings as (
    select m.tcg_id, m.printing, (m.month + (i.day - 1))::date as day, m.cents[i.day] as cents
    from bounds b
    join public.card_price_months m
      on m.language = 'en'
     and m.month between pg_catalog.date_trunc('month', b.day - b.days)::date and b.day
     and m.printing not in ('market', 'holo')
    cross join lateral pg_catalog.generate_series(1, 31) as i(day)
    where m.cents[i.day] is not null
      -- A 31st in a month of thirty is no day at all.
      and pg_catalog.date_trunc('month', m.month + (i.day - 1))::date = m.month
      and (m.month + (i.day - 1)) between b.day - b.days and b.day
  ),
  ends as (
    select r.tcg_id, r.printing,
      (pg_catalog.array_agg(r.cents order by r.day))[1] as was_cents,
      (pg_catalog.array_agg(r.cents order by r.day desc))[1] as now_cents,
      min(r.day) as first_day,
      max(r.day) as last_day
    from readings r
    group by r.tcg_id, r.printing
    having count(*) >= 2
  )
  select e.tcg_id, e.printing, e.was_cents, e.now_cents, e.first_day, e.last_day, b.day
  from ends e
  cross join bounds b
  where least(e.was_cents, e.now_cents) >= 100
    and e.was_cents <> e.now_cents
  order by abs(e.now_cents - e.was_cents) desc, e.tcg_id, e.printing
  limit greatest(1, least(coalesce(p_limit, 200), 1000))
$$;

revoke all on function public.market_mover_candidates(date, integer, integer) from public, anon, authenticated;
grant execute on function public.market_mover_candidates(date, integer, integer) to service_role;
