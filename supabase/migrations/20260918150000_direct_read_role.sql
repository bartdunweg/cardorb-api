-- A role for the API's direct Postgres connection (src/lib/storage/direct.ts), and nothing more.
--
-- Every read went through PostgREST, and the round trip through Supabase's gateway is 40 ms at the
-- median for a row Postgres answers in 0.05 ms (api#559). The direct connection skips the gateway,
-- and with it the JWT that RLS reads `auth.uid()` from, so it must not connect as `postgres`: that
-- role owns every table and reads every row of every account. This role reads two columns of
-- `profiles` and the dollar rate, and there is no grant that reaches a card, a price paid, a note
-- or an email. A leaked connection string reads write counters and exchange rates.
--
-- It cannot log in until the owner gives it a password by hand (docs/direct-db.md), so this
-- migration changes nothing on its own: without DATABASE_POOLER_URL the API never connects.
--
-- R-SEC-002. Growing what it may read is a migration beside the query that needs it.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'cardorb_direct') then
    create role cardorb_direct with login noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
  end if;
end
$$;

-- A stuck query gives up rather than holding a pooled connection; the API falls back to the
-- gateway after two seconds anyway (direct.ts).
alter role cardorb_direct set statement_timeout = '2s';

grant usage on schema public to cardorb_direct;

-- Column grants: `select *` or any other column is refused, not filtered.
grant select (id, cards_version) on public.profiles to cardorb_direct;
grant select (day, rate) on public.usd_eur_rates to cardorb_direct;

-- RLS still applies to this role (nobypassrls, not the owner). profiles_read asks for
-- `auth.uid()`, which this connection never has, so the role gets its own policy; the column
-- grants above are what bound it. The query itself names the caller's id (R-SEC-002).
drop policy if exists profiles_direct_read on public.profiles;
create policy profiles_direct_read on public.profiles for select to cardorb_direct using (true);

-- usd_eur_rates has RLS on and no policy at all (service role only); the rate belongs to nobody.
drop policy if exists usd_eur_rates_direct_read on public.usd_eur_rates;
create policy usd_eur_rates_direct_read on public.usd_eur_rates for select to cardorb_direct
  using (true);
