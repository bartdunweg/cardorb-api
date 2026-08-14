# 0001 — Split lib/core/cards.ts by concern

- Status: accepted
- Date: 2026-08-14

## Decision

`lib/core/cards.ts` (686 lines) mixed four concerns with no seam between them:
name matching, artwork/scan resolution, the Cardmarket link, and collection
assembly (`buildCollection`, `getCardDetail`). Split the first three out into
their own files:

- `lib/core/matching.ts` — `sameCard` (and its private `editDistance`/
  `TYPE_SUFFIX` helpers)
- `lib/core/artwork.ts` — `limitlessScan`, `highScan`
- `lib/core/cardmarket.ts` — `cardmarketUrl` and the generated `LINKS` import

`cards.ts` keeps the types (`OwnedCard`, `CardSet`, `CardDetail`, etc.),
`forGrid`, `stripPrices`, `cardNeighbours`, `buildCollection`, and
`getCardDetail` — the functions that actually assemble a collection — and
imports from the three new files. It re-exports `sameCard` and `highScan` so
every existing `import ... from "lib/core/cards"` across `app/` keeps working
unchanged; nothing outside `lib/core` was touched.

## Alternatives considered

- **Split by data source** (TCGdex vs. Limitless vs. pokemontcg.io) — rejected.
  The natural seams in this file are concerns, not sources: matching and
  artwork resolution each pull from multiple catalogues already (TCGdex,
  then Limitless, then pokemontcg.io as a last resort inside the same
  function). A source-based split would have cut across working functions
  instead of between them.
- **Leave it as one file** — rejected. The README itself calls this file out
  as two years of accreted logic ("none of that was worth writing twice"),
  and it had grown to mix a pure string-matching algorithm, a network-fetch
  fallback chain, and a URL builder inside one module with no boundary
  between them. `sameCard` in particular has its own test file
  (`cards-name.test.ts`) and no dependency on anything else in `cards.ts`,
  which is a strong signal it was already its own concern in practice.

## Why

- `sameCard`/`editDistance` are a pure algorithm with a dedicated test suite;
  isolating them makes that boundary explicit in the file layout, not just in
  the test file's name.
- `limitlessScan`/`highScan` are about resolving artwork and don't know
  anything about matching or Cardmarket; keeping them together but apart from
  the rest shortens the mental model needed to change either.
- `cardmarketUrl` only reads the generated `LINKS` json and builds a URL — it
  has no reason to sit beside 500 lines of collection-assembly logic.

## Verification

`npm run check` (typecheck + 178 tests + lint) passes unchanged before and
after. No external import path changed — every consumer of
`lib/core/cards.ts` (13 files across `app/`) still imports from the same
place.
