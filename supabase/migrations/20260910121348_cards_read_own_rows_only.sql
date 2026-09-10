-- A signed-in stranger could read every private column of a public collection.
--
-- `cards_read` allowed any row whose owner is public, for every role. The anonymous role was
-- narrowed to thirteen columns by a grant, but `authenticated` never was and holds select on all
-- twenty-eight: purchase_price, purchase_date, notes, condition, grade, is_favorite,
-- collection_id, acquired_at. Signup is open, so anyone could confirm an account and read a
-- public collector's ledger straight from PostgREST with the anon key that ships in the web
-- bundle — around this API, and around forPublic(), which exists to strip exactly those fields.
--
-- The public branch is not used by anything. Public collections are read with the service-role
-- client (getPublicCollection, getPublicFolders), which bypasses RLS entirely; the comment at
-- collection.ts:628 records that the anonymous path was abandoned for precisely the reason that
-- the narrow grant refused the full row. So the branch bought nothing and cost everything.
--
-- A row is now yours or it is not yours. Reading somebody else's public collection stays where it
-- already happens: through this API, which decides what is public and strips the rest.

drop policy if exists cards_read on public.cards;

create policy cards_read on public.cards
  for select
  using (user_id = (select auth.uid()));
