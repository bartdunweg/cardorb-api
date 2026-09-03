-- Two things the Supabase performance advisor flags, both cheap and both about scale.
--
-- 1. Every policy calls auth.uid() bare, so Postgres evaluates it once per row rather than once per
--    query. Wrapping it as (select auth.uid()) turns it into an init-plan: one evaluation, then a
--    constant. Same rows allowed and denied; only the plan changes. The advisor names every policy
--    below by name (lint 0003_auth_rls_initplan).
--
-- 2. collections.user_id and imports.user_id are foreign keys without an index. Every "my folders"
--    read and every cascade on account deletion scans the table (lint 0001_unindexed_foreign_keys).
--
-- The policies are recreated with exactly the expressions read off pg_policies on 2026-09-03, with
-- only the auth.uid() calls changed.

-- card_prices
drop policy if exists card_prices_read on public.card_prices;
create policy card_prices_read on public.card_prices for select
  using ((select auth.uid()) is not null);

-- cards
drop policy if exists cards_read on public.cards;
create policy cards_read on public.cards for select
  using (user_id = (select auth.uid()) or exists (select 1 from public.profiles p where p.id = cards.user_id and p.is_public));
drop policy if exists cards_insert on public.cards;
create policy cards_insert on public.cards for insert
  with check (user_id = (select auth.uid()));
drop policy if exists cards_update on public.cards;
create policy cards_update on public.cards for update
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists cards_delete on public.cards;
create policy cards_delete on public.cards for delete
  using (user_id = (select auth.uid()));

-- collection_value_snapshots
drop policy if exists value_snapshots_own on public.collection_value_snapshots;
create policy value_snapshots_own on public.collection_value_snapshots for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- collections
drop policy if exists collections_select on public.collections;
create policy collections_select on public.collections for select
  using (user_id = (select auth.uid()));
drop policy if exists collections_insert on public.collections;
create policy collections_insert on public.collections for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists collections_update on public.collections;
create policy collections_update on public.collections for update
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists collections_delete on public.collections;
create policy collections_delete on public.collections for delete
  using (user_id = (select auth.uid()));

-- imports
drop policy if exists imports_own on public.imports;
create policy imports_own on public.imports for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- profiles
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select
  using (is_public or id = (select auth.uid()));
drop policy if exists profiles_write on public.profiles;
create policy profiles_write on public.profiles for update
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- the two foreign keys without an index
create index if not exists collections_user_id_idx on public.collections (user_id);
create index if not exists imports_user_id_idx on public.imports (user_id);
