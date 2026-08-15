---
id: ADR-0030
title: Remove the Pokémon name filter facet — search already covers it
status: accepted
date: 2026-08-15
scope: repo
deciders: [Bart]
superseded-by: null
tags: [collection, filters, search]
---

# Remove the Pokémon name filter facet — search already covers it

## Context and problem statement

`CardsView.tsx` offered two ways to narrow the collection to one Pokémon: the
toolbar's free-text search (already matches card name, number, type, era,
rarity) and a dedicated "Pokémon" tick-list facet (`key: "name"`, one row per
species in the collection) alongside Era/Rarity/Value/Type/Owned in the
Filter menu/sheet.

Bart: "die pokemon filter hoeft niet want daarvoor kunnen we de search gewoon
gebruiken wmb" (the Pokémon filter isn't needed, search already does that
job).

## Considered options

1. **Keep both.** Rejected — a several-hundred-row tick-list is not free UI:
   `Sheet.tsx`'s own comment on why the sheet body scrolls independently of
   its head/foot cited this exact facet's length as the reason. Search
   already answers "show me this Pokémon's cards" with less UI and no drill-
   down.
2. **Remove the facet, keep search.** Chosen.

## Decision

Deleted the `name` facet end to end in `app/components/CardsView.tsx`:
`pickedNames` state, the `nameOptions` tally, its filter check inside
`filtered`, its entry in the `facets` array, and its entry in `activeFilters`
(the chip list). `CardsPokedex`'s "jump to this Pokémon" (`onPick`) already
went through `setQuery(name)`, not `pickedNames`, so it needed no change.

Two comments that enumerated facets by name were reworded so they don't
describe a facet that no longer exists: `CardsView.tsx`'s "long tick-lists"
comment, and `Sheet.tsx`'s scroll-design comment (which pointed at the
Pokémon facet specifically as its motivating example — now points at Rarity,
the longest remaining one).

`FilterMenu.tsx`/`FilterSheet.tsx`/`FilterOptions.tsx`/`FilterChips.tsx`/
`cards-fields.ts` needed no changes — they're all facet-agnostic and drive
off whatever's in the `facets`/`activeFilters` arrays.

## Consequences

- Good: one fewer control in the Filter menu/sheet; search remains the way
  to find a specific Pokémon.
- Neutral: no route/data change — `nameOptions` was a client-side tally over
  already-loaded cards, not a fetch.

## Confirmation

`npm run check` (typecheck + test + lint) green. No existing test referenced
the facet by name, so no test changes were needed.

## Related

- `docs/decisions/0019-filter-options-facet-css-stays.md` — the facet UI's
  shared row styling, unaffected by this removal.
