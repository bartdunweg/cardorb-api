---
id: ADR-0037
title: Browse the whole catalogue — set list and per-set grid, with ownership marked, off pokemontcg.io
status: accepted
date: 2026-08-16
scope: repo
deciders: [Bart]
superseded-by: null
tags: [browse, catalogue, api, ios, pokemontcg]
---

# Browse the whole catalogue — set list and per-set grid, with ownership marked, off pokemontcg.io

## Context and problem statement

Every screen and every endpoint Card Orb had answered the same question: what is
in *your* collection. `/collection/sets` lists the sets you own a card from,
`/api/v1/collection` returns your rows assembled against three catalogues, and
the add-card dialog searches pokemontcg.io only as a step towards writing a row.
There was no way to ask "what is in Scarlet & Violet 151, all 207 of them, and
which do I already have" — the question a collector asks *before* they own a set.

Bart asked for it for the iOS app, was told the back end had to exist first, and
the API lives in this repo. Confirmed in conversation: API endpoints **and** a
browse screen on cardorb.com; signed-in only, same guard as the existing
`/api/v1/catalog/search`; and each catalogue card carries owned + wishlist +
quantity for the viewer.

`STATE.md` had already recorded this as deliberately deferred: *"a 'browse a
whole set including unowned cards' catalogue feature (a real, separate piece of
work — `/collection/sets` today only ever shows sets the collection already has
a card in)."* This closes it.

Two pieces of history make this less obvious than it looks:

1. A previous session **built and then deleted** `/api/v1/catalog/sets` and
   `/api/v1/catalog/cards/[id]`, off TCGdex, as a set picker in front of the
   add-card dialog. They became redundant the moment ADR-0031/0032 replaced that
   flow with one search box. Re-creating the same path name needs a reason, not
   a shrug.
2. ADR-0014 exists specifically to stop the app paying a per-request catalogue
   walk. A browse feature that reached for `getCards()` would re-introduce
   exactly that cost on a screen where none of it is wanted.

## Considered options

**Which catalogue answers "what is in this set":**

1. **TCGdex**, the source of truth for the assembled collection — rejected. Its
   list endpoint carries no rarity and no types; only its single-card endpoint
   does (established in ADR-0030). Browsing a 207-card set would mean 207 extra
   requests to fill in what a grid shows at a glance. Its set ids also would not
   line up with the ids the add-card search already returns.
2. **pokemontcg.io**, the source the add-card search already uses — chosen. One
   request returns a whole set with rarity, types and both image sizes
   (live-verified: `set.id:sv3pt5` → `totalCount` 207, 207 rows, one page). Same
   ids as search, so a card found by browsing and the same card found by typing
   are the same object, and "add this one" is the flow that already exists.
3. **A `sets`/`cards` catalogue table in Postgres** — rejected as
   disproportionate: it buys offline resilience and costs an import pipeline, a
   migration, and a staleness problem, for a single-owner hobby app whose
   catalogue is already cached for a day and shared by every visitor.

**How ownership is joined:**

4. **Reuse `buildCollection()`** — rejected. It resolves artwork, prices and
   species for ~1,600 rows against three catalogues; browse needs one boolean per
   card. This is the per-request cost ADR-0014 was written to eliminate.
5. **A pure in-memory join over the raw rows** — chosen. `lib/core/ownership.ts`
   indexes rows by normalised set name plus canonical number, and believes a
   number only when `sameCard()` agrees on the name.

**Where it lives:**

6. **Extend `lib/core/ptcg-search.ts`** — rejected. Same host, different
   contract: search is per-keystroke and cached for five minutes, browse is
   per-set and cached for a day. One file would mean one cache lifetime and one
   of the two would be wrong. `ptcg-search.ts` drew the same seam against
   `ptcg.ts` for the same reason.

## Decision

**`lib/core/ptcg-browse.ts`** (new): `listSets()`, `findSet(id)`,
`setCards(id)`, against pokemontcg.io, `next: { revalidate: DAY }`, three
attempts, **throwing** when exhausted rather than answering with an empty list —
ADR-0033's rule, applied to a bigger surface. `setCards()` fetches a whole set
(pageSize 250, looping to `totalCount`, capped at four pages) and sorts by the
number's *value* with lettered runs (TG, GG, SVP) grouped after the main run,
because `orderBy=number` on their side is lexical.

**`lib/core/ownership.ts`** (new, pure, no I/O): `ownershipIndex(rows)`,
`ownershipOf`, `markOwnership`, `setCounts`. Matching is set name + canonical
number, then name-checked with `sameCard()` — ADR-0022 restated: 23 gallery rows
in this collection are filed under a number belonging to a different card, so a
number that lines up is a candidate, not an answer.

**`lib/core/set-aliases.ts`** (new): the three-entry promo alias table that used
to be private to `ptcg.ts`, plus a reverse index and the gallery-parent rule, so
"Silver Tempest Trainer Gallery" finds rows filed under "Silver Tempest" and
"Scarlet & Violet Black Star Promos" finds rows filed under "SV Black Star
Promos". `isGalleryNumber` moved here beside the set-name half of the same fact;
`ptcg.ts` re-exports it.

**`lib/core/collection.ts`** gains `getRows(userId, token?)` — the raw rows,
reusing the existing `unstable_cache`d `cachedRows` (tag `cards:${userId}`), so
browse shares the cache the collection already fills and never assembles it.

**Endpoints**, both behind `authorise()` with `readHeaders()`'s
`private, no-store`:

- `GET /api/v1/catalog/sets` → every set with the viewer's `ownedCount` /
  `wishlistCount`.
- `GET /api/v1/catalog/sets/[setId]` → the set, a page of its cards each carrying
  `owned` / `wishlist` / `quantity` / `itemIds`, plus `totalCount` and
  `ownedCount` over the *whole* set. `page` / `pageSize` (default 60, max 250)
  slice the day-cached full set in memory. Unknown id → 404; catalogue refused →
  502 `catalog-unavailable`.
- `GET /api/v1/catalog/search` keeps its shape and gains the same four ownership
  fields on every result.

Behind the guard rather than public because the *counts* are the viewer's, and a
route whose answer differs per caller cannot be cached at the edge. The
catalogue half is nobody's secret and is cached for a day, shared by everyone.

**Screens**: `/collection/browse` (every set, filterable, "12 of 207" per tile)
and `/collection/browse/[setId]` (the whole set, held cards at full strength,
missing ones dimmed and carrying an Add button). Addressed by the catalogue's set
id rather than a name slug, unlike `/collection/set/[slug]` next door, because
here the thing being opened is the catalogue's set and it has an id — "151" the
set and "151" the number stop being ambiguous. A `browse/error.tsx` of its own,
so `ptcg-browse.ts`'s deliberate throw is not caught by the shell's boundary and
blamed on the database.

Add-from-browse goes through the existing dialog: a new `onAddCard(match)` beside
`onAdd()` in `CollectionContext`, and a `prefill` prop on `CardAddDialog` read in
its **initial state** (AppShell remounts it per prefilled opening via `key`)
rather than in an effect — setting state in an effect to mirror a prop is a
cascading render, which this repo's lint rule rejects outright. This does not
weaken ADR-0032: a prefilled `CatalogueMatch` *is* a catalogue match, the same
object a search result would have been, so nothing writes an unmatched row.

## Consequences

- Good: the question the app could not answer, it now answers, in both places it
  was asked — an API for the iOS client and a screen on the web.
- Good: browse costs one cached request per set and one cached row read, not a
  collection walk. `setCounts()` answers "12 of 207" for 174 sets without
  fetching a single card list.
- Good: the search dialog now marks cards you already own, which is the cheapest
  possible guard against adding a second copy by accident.
- **Bad: pokemontcg.io is now load-bearing for a second feature, and
  `POKEMONTCG_API_KEY` is still unset in production.** Unauthenticated, that host
  measured 5 failures in 10 rapid requests (ADR-0033). Browse mitigates with
  DAY-scoped caching and whole-set fetches, so a warm set is free — but a cold
  set on a bad day is a 502 with a retry button. **A key should now be set.**
- Bad: ownership is joined on set name + number + name, and a row whose number is
  wrong stays unmatched — a card genuinely in the binder shows as missing. That
  is ADR-0022's trade taken deliberately (a wrong match is worse than a missing
  one), and it means the 23 known-bad gallery rows in
  `docs/decisions/trainer-gallery-row-corrections.md` will read as gaps on the
  gallery browse pages until they are fixed.
- Bad: `/api/v1/catalog/sets` exists again after being deleted. Anyone reading
  `STATE.md`'s note that it was redundant needs this record to know why it came
  back and that it is not the same endpoint.
- Neutral: `setCounts()` counts printings rather than distinct cards, so a
  heavily duplicated set can read above its own total. That is the honest reading
  of a store that keeps one row per printing (`collection-row.ts`), and the tiles
  clamp the progress bar rather than the number.
- Neutral: `CardAddDialog` now remounts for each prefilled opening. The plus
  button keeps its constant `key` and the state-across-openings behaviour it
  always had.

## Confirmation

`npm run check` green — typecheck, 402 tests, lint at `--max-warnings 0`.
`npm run build` green, with `/collection/browse`, `/collection/browse/[setId]`,
`/api/v1/catalog/sets` and `/api/v1/catalog/sets/[setId]` all listed as `ƒ`
(dynamic), which is what a route reading cookies has to be (ADR-0035).

New tests: `lib/core/ptcg-browse.test.ts` (URL and query shape, API key header,
the paging loop and its cap, numeric-then-lettered ordering, retry-then-throw,
Lucene escaping of the set id), `lib/core/ownership.test.ts` (zero-padded vs
unpadded numbers, TG rows under a parent set, the promo alias, a number that
lines up on a different card, owned + wishlist at once, quantity summing,
gallery counts kept out of the parent's), and route tests for both new endpoints.
`app/api/v1/catalog/search/route.test.ts` extended for the ownership overlay.

Verified against the live host: `GET /v2/sets` returns 174 sets in one page with
the promo names this repo's alias table assumes; `set.id:sv3pt5` returns
`totalCount` 207 and 207 rows in one request, with rarity and types present.

**Not verified in a signed-in browser this session** — the same blind spot
ADR-0020 was written about. Worth opening `/collection/browse`, then 151, and
checking the marked cards against `/collection/set/151`; a gallery set and a
promo set specifically, since those are where the name/number join is weakest.

## Related

- Requested directly in conversation ("een soort zoekfunctie zodat je gewoon alle
  kaarten die er zijn kunt zoeken en bekijken … dat je bijvoorbeeld een set kunt
  selecteren en alle kaarten die in een set zitten kunt bekijken"), scope
  confirmed by direct question rather than assumed.
- Builds on: ADR-0014 (cache the assembled collection — why browse reads rows,
  not the collection), ADR-0022 (gallery numbers lie — why the join is
  name-checked), ADR-0030 (TCGdex has no rarity in its list endpoint — why
  pokemontcg.io), ADR-0032 (nothing writes an unmatched row — why prefill is a
  catalogue match), ADR-0033 (failed ≠ empty — why the catalogue throws).
- Supersedes: none. The deleted TCGdex `/api/v1/catalog/sets` was a set picker
  for a flow that no longer exists; this is a different endpoint at the same path.
- Code: `lib/core/ptcg-browse.ts`, `lib/core/ownership.ts`,
  `lib/core/set-aliases.ts`, `lib/core/collection.ts`,
  `app/api/v1/catalog/sets/**`, `app/api/v1/catalog/search/route.ts`,
  `app/(app)/collection/browse/**`, `app/components/BrowseSetIndex.tsx`,
  `app/components/BrowseSetGrid.tsx`, `app/components/CardAddDialog.tsx`,
  `app/(app)/AppShell.tsx`, `app/(app)/CollectionContext.tsx`,
  `app/components/CardsSidebar.tsx`, `app/components/AppSidebar.tsx`,
  `app/components/SetIndex.tsx`
