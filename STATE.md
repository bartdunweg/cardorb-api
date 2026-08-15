# State

Where this project stands, for whoever (human or agent) picks it up next.

## Now

Memory system adopted (`docs/decisions/0000-adopt-memory-system.md`). A
refactor pass followed, working through every candidate from the original
survey:

1. Mechanical dedup in `lib/api/guard.ts` and the `/v1` auth routes.
2. `lib/core/cards.ts` split by concern into `matching.ts`/`artwork.ts`/
   `cardmarket.ts` (`docs/decisions/0003-split-lib-core-cards.md`).
3. `lib/core/catalogue.ts`'s raw TCGdex HTTP calls split into
   `tcgdex-client.ts` (`docs/decisions/0004-split-lib-core-catalogue.md`) —
   `setCatalogue`/`unstable_cache` stayed in `catalogue.ts` on purpose, per
   the eslint `CACHE_OWNERS` leash.
4. `app/components/CardsView.tsx` (1,940 lines): `CardItem` and `Segmented`
   split into their own files (`docs/decisions/0005-split-cardsview.md`).
   Verified with a running `npm run dev` and a request to
   `/user/bartdunweg` (200, clean render, no hydration error) — this
   workspace has no `NOTION_TOKEN`, so the actual card grid with real data
   was not exercised.

Merged into that same branch: a concurrent, much larger piece of work that
had already landed on `main` — a Tailwind migration, a design-token system
(`lib/design/`), and a new signed-in app shell (`app/(app)/`, `AppShell`,
`AppSidebar`/`AppTabBar`, `CollectionScreen`/`DashboardScreen`) that gives
`CardsView` new `chrome`/`scope` props and moves `eraYears`/`label` into
`lib/core/eras.ts`. The two efforts touched adjacent but non-overlapping
parts of `CardsView.tsx` (their `chrome`/`scope`/`eras.ts` work vs. this
session's `CardItem`/`Segmented` extraction); the one real conflict was
resolved by keeping both removals. Decision records `0001`/`0002` on `main`
were the landing-page work; this session's records were renumbered `0003`–
`0005` to not collide. `docs/changelog.md` (main's ad hoc file) was folded
into this session's `docs/CHANGELOG.md`/`changelog.d/` convention.

`npm run check` is green throughout (typecheck, tests, lint).

Since then, in this session: signup no longer collects a username. It's
generated server-side (`generateUsername()` in `lib/core/account.ts`, an
adjective+noun+digits scheme, checked against the same taken/reserved logic
the form used to rely on) in `app/api/v1/signup/route.ts`, with a five-attempt
retry loop before falling back to a 503. `SignUpForm.tsx` is down to
email+password, `useSession.ts`'s `signUp` dropped its `username` param.
Settings' existing username-change flow (`ProfileSettings.tsx`, `POST
/api/v1/username`, `claim_username` RPC) needed no changes.
`docs/decisions/0006-generated-username-at-signup.md` and
`docs/changelog.d/2026-08-14-generated-username-signup.md` record it.
`npm run check` is green.

Since then, in this session: a public "latest pull" endpoint for the portfolio
site. `CollectionRow.acquiredAt`/`excluded` (already stored, already sorted on
in `listRows()`) now flow through `buildCollection()` onto `Variant`
(`lib/core/cards.ts`), a new `latestPull(sets)` picks the newest non-excluded
printing and returns a curated (price-free, purchase-data-free) shape, and
`GET /api/v1/public/[username]/latest-pull` serves it with a hard-coded
`Access-Control-Allow-Origin: *` (independent of `guard.ts`'s allowlist, since
this route has no auth/cookies to protect). `docs/decisions/0014-public-latest-pull-endpoint.md`
and `docs/changelog.d/2026-08-15-public-latest-pull-endpoint.md` record it.
`npm run check` is green.

Since then, in this session: `GET /api/v1/catalog/search` no longer requires
`set`. A new `public.catalogue_cards` table
(`supabase/migrations/20260815090000_catalogue_cards.sql`) holds every
TCGdex card across every set, populated weekly by
`app/api/v1/cron/catalogue-refresh/route.ts` (`CRON_SECRET`-gated) calling
`refreshCatalogueIndex()` in the new `lib/core/catalogue-index.ts`; the
search route's no-set path reads it via the new `searchCatalogue()`. The
set-scoped path is unchanged (still `setCatalogue()`, still a day old at
most). `docs/decisions/0015-cross-set-catalogue-search.md` and
`docs/changelog.d/2026-08-15-cross-set-catalogue-search.md` record it, and
also fix a stale `docs/decisions/0006-per-variant-inventory-fields.md`
cross-reference in the route's header comment (that file doesn't exist; the
real rationale was always 0008). `npm run check` is green.

## Open

Nothing flagged from this session's own work. Worth knowing for whoever
picks this up: the merge with the app-shell/Tailwind work was done via
`npm run check` plus a static-render smoke test only (no `NOTION_TOKEN` in
this workspace) — exercising the new `app/(app)/` shell and `CardsView`'s
`chrome={false}` path with real data and a browser hasn't happened yet.

The generated-username signup flow also hasn't been exercised in a running
`npm run dev` + browser session (no `NOTION_TOKEN`/Supabase credentials
confirmed in this workspace) — only `npm run check` and code inspection
verified it. Worth a real signup-and-confirm pass before shipping.

The new `/api/v1/public/[username]/latest-pull` endpoint is unit-tested with
mocked `getCards`/`ownerOf` but hasn't hit real Notion/Postgres data via
`npm run dev` (same credentials gap). Worth a real `curl -i` against a live
collection — including marking a card `excluded` and confirming it drops out —
before the portfolio site is pointed at it.

The cross-set catalogue search added this session (`catalogue_cards`, the
weekly refresh cron, `searchCatalogue()`) is unverified against a live
Supabase project — no credentials in this workspace. Before it ships: run the
migration, trigger `GET /api/v1/cron/catalogue-refresh` with `CRON_SECRET`
set, confirm rows land and RLS behaves (anon can `select`, cannot
`insert`/`update`), then `curl` both search paths. The iOS client
(`CardOrbAPI.swift`, `CardLookupView`) also still needs updating to actually
use the new no-set path — that's a separate repo, not touched here.

## Next session

Ask what's next.
