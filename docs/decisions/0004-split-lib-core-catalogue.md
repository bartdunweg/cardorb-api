# 0004 — Split lib/core/catalogue.ts's HTTP client out

- Status: accepted
- Date: 2026-08-14

## Decision

`lib/core/catalogue.ts` (401 lines) mixed the raw TCGdex HTTP calls (a
retrying `json()` fetcher, `fetchSet()`, `pricesFor()`) with the logic that
decides which calls to make and how to fold the answers into a `SetCatalogue`
(set-name resolution, promo-star branding, pre-pricing). Split the raw calls
out into `lib/core/tcgdex-client.ts`.

`catalogue.ts` re-exports `json` and `pricesFor` from `tcgdex-client.ts`
rather than requiring callers to switch import paths, because two things
depend on that exact path staying importable from `"./catalogue"`:
`lib/core/cards.ts`'s existing `import { json, pricesFor, setCatalogue }
from "./catalogue"`, and the `vi.mock("./catalogue", ...)` in
`collection.test.ts`, which stubs `pricesFor` and asserts on how many times
it was called. Neither had to change.

## What stayed, and why

`unstable_cache`, `loadSetCatalogue`, and the exported `setCatalogue` stay in
`catalogue.ts`. This is not a style choice: `eslint.config.mjs` restricts the
`unstable_cache` import to exactly `lib/core/catalogue.ts` and
`lib/core/collection.ts`, on purpose, so that the eventual move to Next's
`use cache` stays a two-file change (see the comment on `CACHE_OWNERS`
there). Moving `setCatalogue` out would have meant updating that eslint rule
to widen the leash it was written to keep narrow — the opposite of what this
refactor is for. Found by reading the eslint config before touching the file
("look backwards first"), not by guessing.

## Alternatives considered

- **Move `setCatalogue` too**, to a `catalogue-cache.ts` — rejected for the
  eslint-leash reason above.
- **Update the eslint rule to add a third owner** — rejected. The rule's own
  comment says two files is deliberate; widening it wasn't this refactor's
  call to make, and nothing about splitting the client requires it.

## Verification

`npm run check` (typecheck + 178 tests + lint, including the `unstable_cache`
import-leash rule) passes unchanged before and after. `catalogue.ts` shrank
401 → 325 lines; `tcgdex-client.ts` is 101 lines. No import path outside
`lib/core` changed.
