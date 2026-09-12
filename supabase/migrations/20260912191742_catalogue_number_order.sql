-- The catalogue's copy in binder order: XY2 before XY10, 20 before 100, the Trainer Gallery after
-- the main run.
--
-- Every read of catalogue_cards ordered by local_id as a string, so the search, the index the
-- browser searches in and a set's cards all read XY10 before XY2 and 100 before 20, and a set's
-- TG cards sat between its 99 and its 100. The collection has sorted by compareCardNumbers()
-- (src/lib/core/util.ts) since #356; the search pages with LIMIT/OFFSET on this order, so a sort
-- after the fetch would shuffle one page at a time. The rule has to be in the query.
--
-- card_number_sort_key() is compareCardNumbers() as one text that sorts byte by byte (collate
-- "C") into the same order:
--
--   flag        0 the main run, 1 a subset or a number with no digits, 2 an empty number
--   run         the letters before the digits (TG, RC, SV), then chr(1) so TG sorts before TGA
--   digits      how many, in three places, then the digits without leading zeros: numeric
--               order as text. "!" where there are none, which sorts before any count.
--   rest        what follows the digits (67A), then chr(1) so 67A sorts before 67AB
--   raw         the number as written, so the order is total: 043 before 43
--
-- A promo prefix is the number it wraps, as storedCardNumber() says: XY123 is 123. The list is
-- util.ts's PROMO_PREFIXES, and util-number.test.ts fails when the two differ; the same test runs
-- this function in Postgres against compareCardNumbers() on a fixture list.
--
-- The column is stored, so changing the function does not change rows already written: a new
-- rule is a new function and the column dropped and added again.

create or replace function public.card_number_sort_key(n text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when btrim(coalesce(n, ''), E' \t\r\n') = '' then '2' || chr(1) || coalesce(n, '')
    when m is null then '1' || v || chr(1) || '!' || chr(1) || n
    else (case when m[1] = '' then '0' else '1' end)
      || m[1] || chr(1)
      || lpad(length(ltrim(m[2], '0'))::text, 3, '0') || ltrim(m[2], '0')
      || m[3] || chr(1) || n
  end
  from (
    select v, regexp_match(v, '^([A-Z]*)([0-9]+)(.*)$') as m
    from (
      select upper(
        regexp_replace(btrim(coalesce(n, ''), E' \t\r\n'), '^(HGSS|SWSH|SVP|XY|SM|BW|DP)(?=[0-9])', '', 'i')
      ) as v
    ) stripped
  ) parsed
$$;

alter table public.catalogue_cards
  add column if not exists number_order text collate "C"
  generated always as (public.card_number_sort_key(local_id)) stored;

-- The order every answer is read in, by number now instead of by the string.
drop index if exists public.catalogue_cards_order_idx;
create index if not exists catalogue_cards_number_order_idx
  on public.catalogue_cards (release_date desc, set_id, number_order);
