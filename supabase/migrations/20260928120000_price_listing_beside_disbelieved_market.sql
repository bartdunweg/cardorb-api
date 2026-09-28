-- The lowest listing beside a market figure that is not believed, in the price history (2026-09-28).
--
-- TCGplayer's market figure for a card that hardly sells can be one old or odd sale nothing on offer
-- comes near: Team Rocket's Dark Charizard 1st Edition holo read a market of $121.94 while the
-- cheapest copy for sale was $980, and Home showed a visitor its fall to that figure as the week's
-- biggest. A market figure under half the printing's own lowest listing is not believed since then
-- (believedMarket in src/lib/core/price-basis.mjs): today's price is that listing, labelled as one,
-- and on the price line the day is held at the last figure the rule believes, as a stray sale is.
--
-- The line can only be held where the listing is known, and the history kept market figures alone.
-- So the night writes the listing beside such a figure, in `listing_cents`, on the days it is not
-- believed and on no other: about 700 of the 44,000 English printings on 2026-09-28, where a listing
-- beside every figure would be another array on each of the 53,000 rows a month (some 7 MB a month
-- on a 500 MB database that held 404 MB that day). A row with none keeps the column null, which
-- costs a bit in the row's null bitmap. The days stored before this carry no listing and read as they
-- always did.
--
-- Merged like `cents` (merge_price_days): a day sent replaces that day, a day not sent stays. The
-- thinning of months older than six months (thin_oldest_price_month) leaves `listing_cents` as it is:
-- a listing on a day whose figure was thinned away has nothing to stand beside and is not read.

alter table public.card_price_months add column if not exists listing_cents integer[];

comment on column public.card_price_months.listing_cents is
  'TCGplayer''s lowest listing, cents per day like `cents`, only on the days whose market figure is under half of it and so not believed (believedMarket). Null on a row with none.';

create or replace function public.upsert_card_price_months(p_rows jsonb)
returns void
language sql
set search_path = ''
as $$
  insert into public.card_price_months as m (language, tcg_id, printing, month, cents, listing_cents, source)
  select r.language, r.tcg_id, r.printing, r.month, r.cents, r.listing_cents, coalesce(r.source, 'tcgplayer')
  from jsonb_to_recordset(p_rows)
    as r(language text, tcg_id text, printing text, month date, cents integer[], listing_cents integer[], source text)
  on conflict (language, tcg_id, printing, month) do update set
    cents = public.merge_price_days(excluded.cents, m.cents),
    listing_cents = public.merge_price_days(excluded.listing_cents, m.listing_cents),
    source = excluded.source,
    updated_at = now()
$$;

revoke all on function public.upsert_card_price_months(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_card_price_months(jsonb) to service_role;
