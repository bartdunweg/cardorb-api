# 0008 — Per-variant inventory fields, and the bearer/RLS fix that had to come first

- Status: accepted
- Date: 2026-08-14

## Decision

An iOS client (a separate repo) was built against an inventory model this
backend never had: quantity, condition/grade, purchase price and date, notes,
and a favourite flag on each printing, plus per-item PATCH/DELETE and a
catalogue-search-by-name endpoint. None of it existed here. Rather than trim
the iOS client back to the eight fields `collection-row.ts` already had, this
extends the backend to actually support it, at **variant level**: every
printing a person owns or wants gets its own row-backed id and its own
inventory facts, independently editable and deletable. `public.cards` was
already one row per printing (see the comment on that table in
`20260814062300_accounts_and_cards.sql` — "OwnedCard.variants stays what it
always was: a derived thing, folded out of these rows at render time"), so
this is additive to a model that was already the right shape, not a
redesign of it.

## What shipped

- **Migration** (`20260814204500_card_inventory_fields.sql`): seven nullable
  or safely-defaulted columns on `cards` — `quantity` (default 1),
  `condition`, `grade`, `purchase_price`, `purchase_date`, `notes`,
  `is_favorite` (default false). No new RLS policy: `cards_update` etc. are
  already column-agnostic.
- **`lib/core/collection-row.ts`**: the seven fields added to `CollectionRow`
  and `CardDraft`, validated in `validateCardDraft` against the same
  length/range checks the migration's check constraints declare (the two have
  to agree, per that file's own rule), and a new `CardPatch` type +
  `validateCardPatch()` for the PATCH body.
- **`lib/storage/postgres.ts`**: `createRow` writes the new columns;
  `updateRow(db, id, patch)` is new, following `updateProfile`'s
  only-touch-what's-present pattern.
- **`lib/storage/notion.ts`**: defaults the new fields (quantity 1,
  isFavorite false, the rest null) rather than gaining Notion columns —
  Postgres-only, deliberately. Notion is the compatibility path now (see
  `lib/storage/collection.ts`'s own comment); it is not worth extending a
  database this project does not otherwise write to.
- **`lib/core/cards.ts`**: `Variant` grew an `id` (the row it came from) and
  the seven fields, threaded through `buildCollection()`'s printing
  projection. The merge step's old dedup — collapsing two rows that shared
  `(rarity, owned)` into one `Variant` — is now keyed on the row's own `id`
  instead: an id is unique per row by construction, so this is strictly more
  precise, and it stops silently dropping a second row's own quantity/
  condition/price the moment two rows agree on rarity.
- **`app/api/v1/cards/[id]/route.ts`** (new): `PATCH`/`DELETE`, guarded like
  the existing `POST /v1/cards` — `authoriseWrite`, an 8KB→4KB (smaller
  payload) body ceiling, the same cache revalidation. `postgres.deleteRow()`
  existed since the accounts migration with no caller anywhere in the app;
  this is that caller.
- **`app/api/v1/catalog/search/route.ts`** (new): `GET`, requires a `set`
  query param. See "What this does not do" below for why.

## The bearer/RLS bug this uncovered

While wiring the iOS client against this, `POST /v1/cards` and
`GET /v1/collection` were tested directly against production with a real
bearer token (see the diagnostic steps below) and both were broken for every
account: `POST /v1/cards` refused the insert as an RLS violation, and
`GET /v1/collection` came back `{"sets":[]}` for an account that had a card
seeded directly into its row. Neither was new to this session — every
Postgres-backed write and read in the app was affected, for the same root
cause.

`lib/storage/collection.ts`'s three verbs each built their own Postgres
client, independent of who was asking: reads used the anonymous `readClient()`
unconditionally, writes used the cookie-bound `serverClient()`
unconditionally. `serverClient()` resolves a session from `cookies()` and
finds none for a bearer-only caller (curl, the iOS app — see the comment on
`userClient()` in `lib/storage/supabase.ts`, written for exactly this case and
apparently never wired to it), so `auth.uid()` is null for the rest of that
request and row level security — correctly — refuses both the read and the
write. `authorise()`/`authoriseWrite()` had always resolved the caller's
identity from the bearer token via `requestViewer()`; that identity was simply
never handed to the query that needed to prove it.

The fix threads a resolved Postgres client (or the token to build one)
through every verb: `clientFor(token)` in `lib/storage/collection.ts` picks
`userClient(token)` for a bearer caller and `serverClient()` otherwise, and
`lib/core/collection.ts`'s `getCards()` resolves that client *before* entering
`unstable_cache` — cookies() is refused inside it — passing the resolved
client in by closure rather than building it inside. `app/api/v1/profile/route.ts`
had the same two bugs bundled together: `currentViewer()` (cookie-only) meant
the route always refused a bearer caller before the client question even
came up, so it is fixed the same way, using `requestViewer()`.

## Also fixed in passing: signup for anyone with no username in their metadata

`handle_new_user()`'s fallback username — `'u' || replace(new.id::text, '-',
'')` — is 33 characters; `username_shape` allows at most 30. Every account
created without a `username` in `raw_user_meta_data` violated that constraint
and failed the entire `auth.users` insert, because the trigger runs inside
that transaction. The web signup route always supplies a generated username
(see decision 0006 on `main`, `#25`, landed independently and does not touch
this trigger), so it never hit the fallback. The iOS app signs up directly
through the Supabase SDK with no metadata at all — every iOS signup has been
failing since this trigger shipped. Fixed in
`20260814203500_fix_new_user_username_fallback_length.sql` by truncating the
fallback to 29 hex characters (30 total, the constraint's own ceiling).

Both this and the bearer/RLS fix were confirmed against the live database
directly — a test account created via the Supabase admin API, signed in for a
real access token, a card inserted with the service role and read back
through `GET /v1/collection` with that token, `POST /v1/cards` attempted with
that token — rather than inferred from reading the code, and the test account
and row were removed afterward.

## What this does not do

- **No global, cross-set catalogue search.** `setCatalogue()` resolves one
  named set at a time; nothing indexes card names across sets, and building
  that would mean fetching every set from TCGdex per query rather than
  reusing the cache `catalogue.ts` already has. `GET /v1/catalog/search`
  requires a `set` — the add-card flow narrows to a set first.
- **Notion does not gain these columns.** See above.
- **No third field beyond `updateRow`'s allowlist.** Name/number/set/rarity/
  gen/types are not patchable — changing which printing a row names is closer
  to delete-and-recreate than to an edit, and `CardPatch` does not offer it.

## Verification

`npm run check` (typecheck + 313 tests + lint — one pre-existing, unrelated
lint failure in `app/signup/page.tsx` from concurrent work on this branch, not
touched by this change) passes. New route tests for
`app/api/v1/cards/[id]/route.ts` and `app/api/v1/catalog/search/route.ts`
follow `profile/route.test.ts`'s pattern: authorisation refusal, and — the one
that matters most — that a body cannot spoof which row is touched. The
bearer/RLS fix and the signup fix were both confirmed live, as described
above, not just by type or unit tests.
