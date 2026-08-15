---
id: ADR-0015
title: Cross-set catalogue search, backed by a weekly-refreshed index
status: accepted
date: 2026-08-15
scope: repo
deciders: [Bart]
superseded-by: null
tags: [api, catalogue, tcgdex, supabase, cron]
---

# Cross-set catalogue search, backed by a weekly-refreshed index

## Context and problem statement

The iOS "add a card" flow requires choosing a set before it can search by
name or number: `GET /api/v1/catalog/search` has always required `set` and
resolved through `setCatalogue(set)` (`lib/core/catalogue.ts`), which walks
one named set at a time and caches the result for a day. That scoping was a
deliberate decision (`docs/decisions/0008-per-variant-inventory-fields-and-bearer-rls-fix.md`,
"What this does not do"): a global search would mean "fetching every set
from TCGdex per query," uncached, on every keystroke — and
`lib/core/tcgdex-client.ts` documents why that cost is real, not caution for
its own sake (TCGdex starts refusing requests well before 60/minute, and one
refused request on the sets index once took the artwork off every card in
the app at once).

The iOS client just dropped its free-text "add card manually" fallback,
making the catalogue the only way to add a card — which made the mandatory
set-first step the main remaining friction in that flow. The constraint 0008
described was about computing cross-set search *live*, not about cross-set
search existing at all.

## Considered options

1. **Fetch every set from TCGdex live, per query, with no cache.** Rejected —
   this is exactly the cost decision 0008 ruled out, worse under real usage
   (a search box fires on every keystroke) than the one-off collection walk
   0008 was reasoning about.
2. **Widen `unstable_cache`'s existing per-set entries into something
   searchable.** Rejected. `unstable_cache` here is deliberately confined to
   `catalogue.ts`/`collection.ts` (`eslint.config.mjs`'s `CACHE_OWNERS`) and
   stores one `SetCatalogue` per set name; it has no notion of a query across
   entries, and the Next Data Cache isn't a search index. Reworking it to be
   one would be building a database inside a cache, worse at the one thing a
   database already does well.
3. **A Postgres table (`public.catalogue_cards`), populated by a periodic
   background job, queried directly by the search route when no `set` is
   given.** Chosen.

For the refresh cadence: sets don't change once TCGdex has published them,
and a new one lands only occasionally — there's nothing to gain from walking
all ~48 sets more often than the data actually changes. Weekly, not daily
(unlike the existing `/api/v1/health` cron, which exists partly to keep a
free Supabase project from pausing and has no cost reason to slow down).

## Decision

- New table `public.catalogue_cards` (`supabase/migrations/20260815090000_catalogue_cards.sql`):
  one row per TCGdex card across every set, RLS enabled with a single public
  `select` policy and no write policy for `anon`/`authenticated` — reference
  data nobody owns, same reasoning as `profiles` being readable by strangers,
  written only by the service-role client. A trigram (`pg_trgm`) index on
  `lower(name)` backs substring search.
- New `lib/core/catalogue-index.ts`: `refreshCatalogueIndex()` walks every
  TCGdex set sequentially (`mapLimit(ids, 1, fetchSet)`, the same
  rate-limit-respecting pattern `loadSetCatalogue()` already uses for a set's
  subsets) and upserts rows via `adminClient()`; `searchCatalogue()` reads
  the table via `readClient()` — the anon client, not the service role,
  because the table's own RLS policy already grants the read this needs, and
  answering it with a client that bypasses RLS would make that policy not
  the one place the permission is decided.
- New cron route `app/api/v1/cron/catalogue-refresh/route.ts`, gated by a
  `CRON_SECRET` compared in constant time (the same pattern `guard.ts` uses
  for `CARDS_TOKEN`) — unlike `/api/v1/health`, this route triggers ~48
  outbound TCGdex requests and a bulk write, so it isn't left open. Wired
  into `vercel.json`'s `crons` array, weekly.
- `app/api/v1/catalog/search/route.ts`: `set` is now optional. With `set`,
  behavior is unchanged (still `setCatalogue()`, still a day old at most).
  Without it, `query` is required (minimum 3 characters, matching pg_trgm's
  3-character trigram basis — a shorter query gets little benefit from the
  index and degrades toward a full scan) and the route reads from
  `searchCatalogue()` instead — up to a week old rather than a day, the cost
  of not walking TCGdex on the request path at all.
- Fixed a stale cross-reference found while touching the route: its header
  comment cited `docs/decisions/0006-per-variant-inventory-fields.md`, which
  doesn't exist (0006 is "generated username at signup"); the real rationale
  was always 0008.

## Consequences

- Good, because the iOS "add a card" flow (and any other client) can now
  search the whole catalogue without asking the user to pick a set first,
  which was the actual product ask behind this change.
- Good, because the set-scoped path is untouched — existing callers see no
  behavior change, and freshness there stays a day, not a week.
- Neutral, because cross-set results are up to a week stale. Acceptable:
  sets don't change after publication, so staleness here means "a set that
  released this week might be missing," not "wrong data for an existing
  card."
- Neutral, because this adds a second Postgres table with a different
  ownership model (reference data, not per-user rows) — the existing
  `public.cards` table wasn't reused because it's unambiguously "what a user
  owns," not "what TCGdex publishes," and folding both into one table would
  have made every query on either concept need to filter out the other.

## Confirmation

`npm run check` (typecheck + test + lint) passes, including new coverage:
`lib/core/catalogue-index.test.ts` (walks every set, skips a set TCGdex
refused without failing the run, escapes characters that would otherwise
break the `or()` filter syntax) and extended
`app/api/v1/catalog/search/route.test.ts` coverage for the no-set path
(rejects a too-short/missing query, returns results spanning multiple sets,
never calls `setCatalogue()` on that path). Not exercised against a live
`npm run dev` + real Supabase project in this session — no credentials were
available in this workspace, so the migration, the cron route's actual
TCGdex walk, and RLS behavior are unverified beyond code inspection and unit
tests. Worth a real run (`supabase db push`, then a manual
`GET /api/v1/cron/catalogue-refresh` with the secret, then both search
paths) before this ships.

## Related

- Code: `supabase/migrations/20260815090000_catalogue_cards.sql`,
  `lib/core/catalogue-index.ts`,
  `app/api/v1/cron/catalogue-refresh/route.ts`,
  `app/api/v1/catalog/search/route.ts`
- Supersedes the scoping half of `docs/decisions/0008-per-variant-inventory-fields-and-bearer-rls-fix.md`'s
  "No global, cross-set catalogue search" — not a formal supersession (0008
  covers other, unrelated decisions too), but that specific constraint no
  longer holds as written.
- Out of scope here: the iOS client (`CardOrbAPI.swift`, `CardLookupView` in
  `AppShell.swift`) lives in a separate repo and still requires `set`. It
  needs a `set`-optional call (or a new method) to actually use this.
