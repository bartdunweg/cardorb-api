-- The price history's key is (language, tcg_id, printing, month) (2026-09-15). Part two of two;
-- part one (20260915161000) added the language, set it on the Japanese rows and dropped the old key.
--
-- The unique index is built first and then made the primary key, so reads go on while it builds
-- (a plain ADD PRIMARY KEY would lock them out for the build); writes wait for it.
create unique index if not exists card_price_months_pkey
  on public.card_price_months (language, tcg_id, printing, month);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.card_price_months'::regclass and contype = 'p'
  ) then
    alter table public.card_price_months
      add constraint card_price_months_pkey primary key using index card_price_months_pkey;
  end if;
end
$$;

-- The thinning and the morning check read a whole month.
create index if not exists card_price_months_month_idx on public.card_price_months (month);

-- No default from here: a writer that does not say which catalogue a card is from is refused, not
-- filed as English. The rows written before keep 'en' (the value stored beside the table).
alter table public.card_price_months alter column language drop default;

comment on column public.card_price_months.language is 'The catalogue tcg_id is an id of: en or ja. Part of the key, because the two catalogues share ids (neo4-100 to neo4-113).';

-- Months written as JSON rows ({language, tcg_id, printing, month, cents, source}), merged into what
-- is stored. A row without a language fails the not-null column.
create or replace function public.upsert_card_price_months(p_rows jsonb)
returns void
language sql
set search_path = ''
as $$
  insert into public.card_price_months as m (language, tcg_id, printing, month, cents, source)
  select r.language, r.tcg_id, r.printing, r.month, r.cents, coalesce(r.source, 'tcgplayer')
  from jsonb_to_recordset(p_rows)
    as r(language text, tcg_id text, printing text, month date, cents integer[], source text)
  on conflict (language, tcg_id, printing, month) do update set
    cents = public.merge_price_days(excluded.cents, m.cents),
    source = excluded.source,
    updated_at = now()
$$;

-- The cards of one catalogue with a reading on one day, for the backfill's "cards held now".
drop function if exists public.card_ids_priced_on(date);
create or replace function public.card_ids_priced_on(p_date date, p_language text)
returns setof text
language sql
stable
set search_path = ''
as $$
  select distinct tcg_id from public.card_price_months
  where language = p_language
    and month = date_trunc('month', p_date)::date
    and cents[extract(day from p_date)::int] is not null
$$;

revoke all on function public.upsert_card_price_months(jsonb) from public, anon, authenticated;
revoke all on function public.card_ids_priced_on(date, text) from public, anon, authenticated;
grant execute on function public.upsert_card_price_months(jsonb) to service_role;
grant execute on function public.card_ids_priced_on(date, text) to service_role;
