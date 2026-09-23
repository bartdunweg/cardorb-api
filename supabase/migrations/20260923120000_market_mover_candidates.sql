-- The candidates for the market movers: the English printings whose price moved most, in euros, over
-- the last few days any row has (2026-09-23).
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
-- The window ends on the latest day any English row has a figure, not on today: the nightly write
-- is what moves the list, and a night it did not run should leave last week's movers standing
-- rather than an empty week. Only the months the window touches are read, which the key
-- (language, tcg_id, printing, month) serves: for a week, this month and at most the one before.
--
-- The floor: a printing at under a euro (100 cents) at either end of the window is no candidate.
-- The stray rule does not judge a line whose median is under 25 cents, since at that level five
-- times is TCGplayer's own rounding, so a four-cent card that one trade sent to two euros is the
-- figure it cannot see, and ranked by euros it would top a quiet week. The API holds the lines to
-- the same number (MARKET_MOVER_FLOOR_CENTS), so the narrowing and the list cannot disagree.
--
-- 'market' and 'holo' are the two series from before printings were stored (LEGACY in
-- price-months.mjs), not printings, and every row a recent window reads has real ones.
--
-- security definer, set search_path = '', and executable by the service role alone. The API reads
-- it for a caller with no account, as it reads card_price_months for one (getCardPrices, reader
-- "nobody"). `anon` has no grant on that table and gets none here either: with the anon key every
-- browser carries, a grant would put the catalogue's prices on PostgREST, past the API's limiter.
-- Nor `authenticated`: nothing reads it as the caller.
create or replace function public.market_mover_candidates(p_days integer default 7, p_limit integer default 200)
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
security definer
set search_path = ''
as $$
  with latest_month as (
    select max(m.month) as month from public.card_price_months m where m.language = 'en'
  ),
  -- The last day of that month any row has a figure for: counted down from the 31st, so the days
  -- after it cost one look each and the first day with a figure stops the count.
  latest as (
    select (lm.month + (d.day - 1))::date as day
    from latest_month lm
    cross join lateral (
      select g.day from pg_catalog.generate_series(31, 1, -1) as g(day)
      where exists (
        select 1 from public.card_price_months m
        where m.language = 'en' and m.month = lm.month and m.cents[g.day] is not null
      )
      order by g.day desc
      limit 1
    ) as d
  ),
  readings as (
    select m.tcg_id, m.printing, (m.month + (i.day - 1))::date as day, m.cents[i.day] as cents
    from latest l
    join public.card_price_months m
      on m.language = 'en'
     and m.month between pg_catalog.date_trunc('month', l.day - p_days)::date and l.day
     and m.printing not in ('market', 'holo')
    cross join lateral pg_catalog.generate_series(1, 31) as i(day)
    where m.cents[i.day] is not null
      -- A 31st in a month of thirty is no day at all.
      and pg_catalog.date_trunc('month', m.month + (i.day - 1))::date = m.month
      and (m.month + (i.day - 1)) between l.day - p_days and l.day
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
  select e.tcg_id, e.printing, e.was_cents, e.now_cents, e.first_day, e.last_day, l.day
  from ends e
  cross join latest l
  where least(e.was_cents, e.now_cents) >= 100
    and e.was_cents <> e.now_cents
  order by abs(e.now_cents - e.was_cents) desc, e.tcg_id, e.printing
  limit greatest(1, least(p_limit, 1000))
$$;

revoke all on function public.market_mover_candidates(integer, integer) from public, anon, authenticated;
grant execute on function public.market_mover_candidates(integer, integer) to service_role;
