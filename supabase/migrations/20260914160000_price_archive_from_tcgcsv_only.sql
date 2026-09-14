-- The price archive holds one kind of figure: TCGplayer's market price from tcgcsv, from 2024-02-08.
--
-- Bart, 2026-09-14: the weekly sales averages from before tcgcsv's archive go. They came from
-- tcgdex/price-history (TCGplayer sales, November 2022 to November 2023) for 451 cards only, a week
-- counted only with two sales or more so points stood two or three weeks apart, and that source has
-- no sale at all from December 2023 to February 2024: a line that changed kind and then broke off.
-- Every chart now starts on 2024-02-08, one market and one kind of number.
--
-- Also the plain and foil series copied from card_prices ('market', 'holo', August and September
-- 2026) where every reading in the row is also in a real printing's row for the same card and day.
-- Checked 2026-09-14: 62,505 foil readings all covered; 136,576 plain readings of which 368 are a
-- card's only reading that day, so those rows stay.

delete from public.card_price_months where source = 'tcgplayer-sales';

delete from public.card_price_months as l
where l.printing in ('market', 'holo')
  and not exists (
    select 1
    from generate_series(1, 31) as d
    where l.cents[d] is not null
      and not exists (
        select 1 from public.card_price_months as p
        where p.tcg_id = l.tcg_id
          and p.month = l.month
          and p.printing not in ('market', 'holo')
          and p.cents[d] is not null
      )
  );
