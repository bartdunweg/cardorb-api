# State

Where this project stands, for whoever (human or agent) picks it up next.

## Now

Memory system adopted (`docs/decisions/0000-adopt-memory-system.md`). A
refactor pass followed, working through every candidate from the original
survey:

1. Mechanical dedup in `lib/api/guard.ts` and the `/v1` auth routes.
2. `lib/core/cards.ts` split by concern into `matching.ts`/`artwork.ts`/
   `cardmarket.ts` (`docs/decisions/0001-split-lib-core-cards.md`).
3. `lib/core/catalogue.ts`'s raw TCGdex HTTP calls split into
   `tcgdex-client.ts` (`docs/decisions/0002-split-lib-core-catalogue.md`) —
   `setCatalogue`/`unstable_cache` stayed in `catalogue.ts` on purpose, per
   the eslint `CACHE_OWNERS` leash.
4. `app/components/CardsView.tsx` (1,940 lines): `CardItem` and `Segmented`
   split into their own files (`docs/decisions/0003-split-cardsview.md`).
   Verified with a running `npm run dev` and a request to
   `/user/bartdunweg` (200, clean render, no hydration error) — this
   workspace has no `NOTION_TOKEN`, so the actual card grid with real data
   was not exercised.

`npm run check` is green throughout (178 tests, typecheck, lint).

## Open

Nothing flagged. The original refactor survey's candidates are all done or
explicitly addressed. If picking this up with real collection credentials,
it would be worth manually exercising `CardsView`'s filtering/sorting/scan-
zoom in a browser to double-check the `CardItem`/`Segmented` split against
real data — see the verification gap noted in
`docs/decisions/0003-split-cardsview.md`.

## Next session

Ask what's next.
