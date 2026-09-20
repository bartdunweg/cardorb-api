-- Least privilege for the two roles a stranger can reach: `anon` and `authenticated`.
--
-- Supabase grants ALL on every new table in `public` to both of them, and this database had
-- never taken any of it back except one line of it (20260910121348 revoked SELECT on `cards`
-- from `anon`). So every table here handed `anon` and `authenticated` INSERT, UPDATE, DELETE,
-- TRUNCATE, REFERENCES and TRIGGER, and SELECT on all but one. Nothing was exploitable: row
-- level security is on for all fifteen tables and refuses what has no policy. But the grant is
-- the outer wall and RLS is the inner one, and this had only the inner one: a policy written a
-- little too wide, or a table that is created and whose policies are added in a second
-- statement, is the whole database in the hands of whoever has the publishable anon key, which
-- is in both clients' bundles by design.
--
-- What is really needed is small and knowable, because no client talks to PostgREST at all: the
-- web app makes no `.from()` call outside its tests, and the iOS app's only use of Supabase is
-- the session. Every read and write of `public` is made by this API, either as the service role
-- (`adminClient()`, which bypasses RLS and is not touched here) or with the caller's own bearer,
-- which arrives as `authenticated` (or as `anon` on the routes that answer a signed-out person).
-- So the rule below is: keep exactly the verbs the API uses through a caller's client, and
-- nothing else. Each table says who still needs what and why.
--
-- R-SEC-003. A new table granted to either role is a migration that says which verb a client
-- needs and why, beside the code that needs it.
--
-- Read back after this lands with:
--   select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type)
--   from information_schema.role_table_grants
--   where table_schema = 'public' and grantee in ('anon', 'authenticated')
--   group by 1, 2 order by 1, 2;

-- ── The clean slate ────────────────────────────────────────────────────────────────────────
-- Everything off first, then only what is used back on. Written this way rather than as a list
-- of revokes so the grants below are the whole answer: what is not named here is not granted,
-- and a reader does not have to subtract two lists to find out.
revoke all on all tables in schema public from anon, authenticated;

-- ── cards ──────────────────────────────────────────────────────────────────────────────────
-- The owner's own rows, through `userClient()`/`serverClient()` on every collection route:
-- listRows reads them, createRow/updateRow/updateRows/deleteRow write them, and fold_card,
-- fold_identical_cards, split_card and collection_options() are `security invoker`, so they need
-- the caller's own privileges too. The four `cards_*` policies already scope every verb to
-- `user_id = auth.uid()`, so `authenticated` reaches its own rows and no others.
-- `anon` gets nothing: it lost SELECT in 20260910121348 and the write verbs were dead weight,
-- because every `cards_*` policy compares against an `auth.uid()` that is null for `anon`. A
-- public profile's rows are read by the service role (getPublicCollection), never as `anon`.
grant select, insert, update, delete on public.cards to authenticated;

-- ── collections (the binders) ──────────────────────────────────────────────────────────────
-- The same story: getFolder, createFolder, updateFolder and deleteFolder all go through
-- `clientFor(token)`, and the four `collections_*` policies scope every verb to the owner.
grant select, insert, update, delete on public.collections to authenticated;

-- ── imports ────────────────────────────────────────────────────────────────────────────────
-- `POST /v1/import/csv` inserts a run and updates its progress, `GET /v1/imports` lists them,
-- both through `clientFor(token)`; `imports_own` scopes them to the owner. Nothing deletes an
-- import row, so DELETE goes, and the `imports_own` policy would allow it again the day
-- something does.
grant select, insert, update on public.imports to authenticated;

-- ── collection_value_snapshots ─────────────────────────────────────────────────────────────
-- Read for the Home chart through the caller's client (cachedSnapshots), scoped by
-- `value_snapshots_own`. Written only by the nightly cron, which is the service role: there is
-- nobody to be at four in the morning. So SELECT and no more.
grant select on public.collection_value_snapshots to authenticated;

-- ── card_price_months ──────────────────────────────────────────────────────────────────────
-- A card's price line, read through the caller's client (getCardPrices) and allowed to any
-- signed-in person by `card_price_months_read`: the prices are the catalogue's, not anybody's.
-- Written by the price cron alone, as the service role. `anon` has no policy here and never had
-- an answer, so it loses the grant with the rest.
grant select on public.card_price_months to authenticated;

-- ── profiles ───────────────────────────────────────────────────────────────────────────────
-- The one table where the answer is columns rather than verbs. `profiles_read` already keeps the
-- rows to `is_public or id = auth.uid()`, but every column came with them, and three of those
-- are nobody's business: `created_at` and `updated_at`, and `cards_version`, which is bumped by
-- a trigger on every write to a person's cards and so says, to anyone who asks twice, when an
-- owner last edited their collection. None of the three is read through a caller's client
-- anywhere in this API except `cards_version`, which is, by the rows cache's key.
--
-- `anon` needs exactly the public profile: `publicProfile()` and `publicUsernames()` run on
-- `serverClient()`, which is `anon` for a signed-out stranger on `/v1/public/<username>/*`, and
-- they select id, username, display_name, avatar_url, wishlist_public and favorites_public. It
-- also needs `id` for `GET /v1/health` (one row, to prove Postgres answers) and `username` for
-- the name-collision probe in `POST /v1/signup`. A filter counts: `.eq("is_public", true)` reads
-- that column, so it is granted; the identical test inside `profiles_read` does not need a grant,
-- because a policy's own expression is not privilege-checked against the caller.
grant select (id, username, display_name, avatar_url, is_public, wishlist_public, favorites_public)
  on public.profiles to anon;
--
-- `authenticated` needs those same columns (a signed-in person can open somebody's public page
-- too), plus `onboarded_at` for `ownProfile()` and `cards_version` for `cardsVersion()`, which
-- keys the rows cache so a read begun before a write cannot be stored as the rows after it.
-- `cards_version` therefore stays readable for public profiles by a signed-in stranger, which is
-- a narrower leak than the one above and the price of that cache key; closing it would mean
-- reading the column as the service role on every request, which this API does not do for a
-- per-person read.
grant select (id, username, display_name, avatar_url, is_public, wishlist_public,
              favorites_public, onboarded_at, cards_version)
  on public.profiles to authenticated;
--
-- The only write a person makes to their own profile is the settings patch, `updateProfile()`,
-- which touches these six columns and stamps `updated_at`; `profiles_write` scopes it to
-- `id = auth.uid()`. `username` is deliberately absent: it is claimed through
-- `claim_username()`, which is `security definer` and does the update itself, so no column
-- grant is needed for a rename and one would only widen what a client could do by hand.
-- `prices_public` is absent because nothing reads or writes it.
grant update (display_name, avatar_url, is_public, wishlist_public, favorites_public,
              onboarded_at, updated_at)
  on public.profiles to authenticated;

-- ── reserved_usernames ─────────────────────────────────────────────────────────────────────
-- The list of names nobody may take, read by `POST /v1/signup` through `serverClient()`: `anon`
-- for the ordinary signed-out signup, `authenticated` on the same route from a browser that
-- still holds a session. `reserved_read` is `using (true)` on purpose; the list is not a secret,
-- it is a refusal. Nothing but a migration ever writes it.
grant select on public.reserved_usernames to anon, authenticated;

-- ── The tables only the service role touches ───────────────────────────────────────────────
-- catalogue_cards, catalogue_sets, catalogue_index, catalogue_sync, card_print_pictures,
-- tcgplayer_prices, usd_eur_rates, card_price_months_thinned. Every one is written by a cron and
-- read by the routes through `adminClient()` (the catalogue routes, storedPricesFor,
-- storedUsdToEur, the mirrors); not one of them has an RLS policy, so `anon` and `authenticated`
-- were already getting an empty answer rather than a refusal. They now get a refusal, and keep
-- no grant at all.
--
-- `force row level security` on top, for the day one of them is handed a grant again: it makes
-- the policies apply to the table's owner as well, so a role that is not `bypassrls` cannot read
-- a table with no policy on it whatever its grants say. It changes nothing today, because both
-- `postgres` and `service_role` are `bypassrls` and go past RLS either way. It is the belt
-- beside the braces, not the braces.
alter table public.catalogue_cards force row level security;
alter table public.catalogue_sets force row level security;
alter table public.catalogue_index force row level security;
alter table public.catalogue_sync force row level security;
alter table public.card_print_pictures force row level security;
alter table public.tcgplayer_prices force row level security;
alter table public.usd_eur_rates force row level security;
alter table public.card_price_months_thinned force row level security;

-- ── The next table ─────────────────────────────────────────────────────────────────────────
-- All of the above would come back on the next `create table`: Supabase's default privileges in
-- `public` grant ALL on new tables to `anon` and `authenticated`, which is how fifteen tables
-- ended up this way without anyone writing a grant. Off for the tables this project's migrations
-- create, which run as `postgres`; `service_role` keeps its default grant, so a new table works
-- for the API on the day it is created and a client reaches it only if a migration says so out
-- loud. The matching defaults owned by `supabase_admin` are left alone: they are the platform's,
-- not ours.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
