-- The database's size in bytes, for the snapshot cron's guard on the every-card pass.
--
-- Since 2026-09-13 the cron prices every English card every night, about 4.3 MB a night in
-- card_prices, on a free plan whose database limit is 500 MB. It reads this first and goes back to
-- Saturdays above its ceiling, so a full plan can never put the project in read-only mode.
-- Service role only.
create or replace function public.database_size_bytes()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$ select pg_catalog.pg_database_size(pg_catalog.current_database()) $$;

revoke all on function public.database_size_bytes() from public, anon, authenticated;
grant execute on function public.database_size_bytes() to service_role;
