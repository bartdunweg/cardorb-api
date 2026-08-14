---
id: ADR-0014
title: Public "latest pull" endpoint, reusing the dormant excluded/acquiredAt fields
status: accepted
date: 2026-08-15
scope: repo
deciders: [Bart]
superseded-by: null
tags: [api, public, cors]
---

# Public "latest pull" endpoint, reusing the dormant excluded/acquiredAt fields

## Context and problem statement

The portfolio site (bartdunweg.com, outside this repo) wants to show whichever
card was most recently added to the Card Orb collection. `CollectionRow.excluded`
(`lib/core/collection-row.ts`) already carried the comment "kept out of the
'latest pull' on bartdunweg.com" and `CollectionRow.acquiredAt` already existed
and was already sorted on in `listRows()` — but neither field survived
`buildCollection()` into `Variant`, so nothing, public or private, could read
them. The portfolio site is a different origin, and the existing public routes
(`.../collection`, `.../cards/[tcgId]`) set no CORS headers at all, so even with
the data threaded through, a cross-origin `fetch()` from the portfolio would be
blocked by the browser.

## Considered options

1. **Add a new field to the existing `/collection` response and let the
   portfolio compute "latest" client-side.** Rejected: it would ship the whole
   collection (still price-free, but still every card and every private
   `purchasePrice`/`condition`/`notes`/`quantity` field once those are threaded
   through) across origins for what only needs one card, and it still needs a
   curated shape.
2. **A dedicated `/api/v1/public/[username]/latest-pull` endpoint returning a
   single curated object, mirroring `stripPrices()`/`forGrid()`'s pattern of a
   narrow public shape rather than the raw `OwnedCard`/`Variant`.** Chosen.
3. **For CORS: widen `ALLOWED_ORIGINS` (`lib/api/guard.ts`) to include the
   portfolio domain and route this endpoint through `readHeaders()`.** Rejected
   for this endpoint specifically: `readHeaders()` pairs its CORS allowance with
   credentials, which this route has no use for (no auth, no cookies), and an
   allowlist adds a config dependency (an env var kept in sync across two
   projects) for a route that has nothing worth restricting access to — it is
   already unauthenticated and now carries no price either.

## Decision

Thread `acquiredAt`/`excluded` through `Variant` in `buildCollection()`
(`lib/core/cards.ts`), add a `latestPull(sets)` helper that picks the newest
non-excluded printing and returns a curated shape (name, artwork, rarity, set,
`acquiredAt` — no price, no purchase/inventory fields), and serve it from
`app/api/v1/public/[username]/latest-pull/route.ts` with a hard-coded
`Access-Control-Allow-Origin: *`, independent of `guard.ts`'s allowlist.

## Consequences

- Good, because the `excluded` checkbox already in `CardAddDialog.tsx` has a
  reader for the first time — hiding a card from the public "latest pull" is
  no longer inert.
- Good, because the wildcard CORS header is scoped to exactly one route with no
  auth, cookies, or price surface — widening it further (e.g. to `/collection`)
  is a separate decision if the portfolio ever needs more than one card.
- Neutral, because `acquiredAt`/`excluded` now also flow through the private
  `/api/v1/collection` route (nothing consumes them there yet) — acceptable
  since both were already stored and neither is sensitive.

## Confirmation

`npm run check` (typecheck + test + lint) passes, including new coverage:
`lib/core/cards-latest-pull.test.ts` (empty/all-excluded/no-acquiredAt/newest-pick)
and `app/api/v1/public/[username]/latest-pull/route.test.ts` (200 with the
newest card, no price/purchase data in the body, `Access-Control-Allow-Origin:
*`, 404 for an unknown username without walking the collection, 404 for an
empty/all-excluded collection). Not exercised against a live `npm run dev` +
real Notion/Postgres data in this session — no `NOTION_TOKEN`/Supabase
credentials were available in this workspace.

## Related

- Code: `lib/core/cards.ts` (`Variant`, `latestPull`),
  `lib/core/collection-row.ts` (`acquiredAt`, `excluded`),
  `app/api/v1/public/[username]/latest-pull/route.ts`
