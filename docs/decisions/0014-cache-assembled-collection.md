---
id: ADR-0014
title: Cache the assembled collection, not just its inputs
status: accepted
date: 2026-08-15
scope: repo
deciders: [Bart]
superseded-by: null
tags: [performance, caching]
---

# Cache the assembled collection, not just its inputs

## Context and problem statement

Vercel reported a high "Total CPU time of your Vercel Functions running on Fluid" for
cardorb. Fluid compute bills CPU regardless of concurrency, so repeated, avoidable
server-side computation is a direct cost, not just a latency concern.

`buildCollection()` (`lib/core/cards.ts`) is a pure function of two already-cached
inputs — the collection rows (`unstable_cache`, 1h TTL, tagged `cardsTag(userId)`) and
the per-set catalogue (`unstable_cache`, 1 day TTL) — but the assembly itself was only
wrapped in React's `cache()`, which dedupes calls within a single render and buys
nothing across requests. `app/(app)/layout.tsx` is `force-dynamic` and calls
`getCards()` on every authenticated navigation, most pages under it call it again, and
the public API routes (`app/api/v1/collection`, `app/api/v1/public/[username]/collection`)
are `force-dynamic` too. So the full walk — grouping ~1,600–2,000 rows, a Levenshtein
edit-distance check per matched card (`sameCard`), a linear substring scan through
~1,000+ species names per card (`speciesOf`), and sorting — reran on nearly every
request, uncached, despite depending on nothing that changes that often.

## Considered options

1. **Wrap `buildCollection` itself in `unstable_cache`, inside `lib/core/cards.ts`.**
   Closest to the source of the cost, but `eslint.config.mjs` restricts the
   `unstable_cache` import to exactly `lib/core/catalogue.ts` and
   `lib/core/collection.ts` — the two files the codebase has designated as cache
   owners — so this would need a lint exception.
2. **Wrap a call to `buildCollection` in `lib/core/collection.ts`, alongside the
   existing `cachedRows`.** Consistent with the existing cache-owner boundary, and
   `getCards` already lives here as the seam between "whose collection" and "what a
   collection is."
3. **Do nothing here and instead cache further upstream (e.g. HTTP-level caching on
   the API routes).** Rejected — the routes return `Cache-Control: private, no-store`
   deliberately, since responses are per-owner; and this wouldn't help the page
   renders under `app/(app)/layout.tsx` at all, which are the majority of the traffic.

## Decision

We will add `cachedCollection(userId, db)` in `lib/core/collection.ts`, wrapping
`buildCollection(await cachedRows(userId, db))` in `unstable_cache`, keyed by
`["collection", userId]`, tagged `[cardsTag(userId)]`, with the same `revalidate: 3600`
as `cachedRows`. `getCards` now calls `cachedCollection` instead of calling
`buildCollection` directly.

Chosen because it stays inside the codebase's existing cache-owner boundary (option 2)
rather than opening a new one (option 1), and because reusing `cardsTag(userId)` means
the four write routes that already call `revalidateTag(cardsTag(userId))` on a mutation
(`app/api/v1/collection/items/[id]/route.ts`, `app/api/v1/cards/route.ts`,
`app/api/v1/import/notion/route.ts`, `app/api/v1/import/csv/route.ts`) invalidate the
assembled collection for free — no second invalidation path to keep in sync. The TTL
matches `cachedRows` because the assembled collection can never be fresher than the
rows it's built from; giving it a different TTL would only ever make it stale relative
to its own input.

## Consequences

- Good, because the expensive per-request matching/scanning/sorting walk now only runs
  once an hour per user (or on an explicit write), instead of on every page navigation
  and every API call.
- Good, because no new invalidation logic was needed — the existing write-route
  `revalidateTag` calls already cover it.
- Bad, because a bug in `buildCollection` (or in Next's cache) now has up to an hour of
  blast radius instead of one render's worth, same tradeoff already accepted for
  `cachedRows`.
- Neutral, because `unstable_cache` does not persist thrown errors, so the existing
  fail-soft behavior in `getCards`'s `try/catch` is unchanged.

## Confirmation

`npm run check` passes. Manually: hitting `/api/v1/collection` or a `/cards` page twice
in a row should show the second call reusing the cache; patching a collection item via
`app/api/v1/collection/items/[id]/route.ts` should make the very next read reflect the
change. Actual Fluid CPU-time reduction can only be confirmed by watching the Vercel
dashboard after deploy.

## Related

- Code: `lib/core/collection.ts`, `lib/core/cards.ts`, `lib/core/collection-row.ts`
