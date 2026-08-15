---
id: FB-0005
date: 2026-08-15
source: Bart
source-type: stakeholder
severity: 3
sentiment: mixed
status: addressed
tags: [add-card, ux, search]
---

# The add-card entry point should be one search bar, not a form with fields

## What was said

> "als je op plus klikt, wat je zou moeten zien is een grote search bar je begint met
> tikken je ziet cards verschijnen, de search bar werkt ook voor nummers, type en set
> snap je? dus 1 invoerveld voor alles zegmaar"

English: "When you click plus, what you should see is one big search bar — you start
typing, you see cards appear. The search bar also works for numbers, type, and set,
you know? So one input field for everything."

## Context

Immediately after ADR-0030 shipped: `CardAddDialog.tsx` kept its eight-field form
(Set, Number, Name, Rarity, Gen, Type chips, two checkboxes), reordered Set above
Name, and added a debounced thumbnail-preview strip under Name that only activates
once a set has been typed — scoped to that one set, matching `/api/v1/catalog/
search`'s existing set-scoping.

## Interpretation

The multi-field form itself is the problem, not just the Name field's lack of
assistance. Bart wants the search bar to *be* the add-card interface: one input,
matched against name, number, set, and type all at once, with results appearing
live and unscoped — no "pick a set first" gate. ADR-0030's reordering was a
reasonable read of the literal ask ("live result as I type") but missed that the
whole form should collapse into search, not gain a second field to fill in before
search works. The existing `/api/v1/catalog/search` route's one-set-at-a-time
scoping (built to avoid an uncached fetch across every TCGdex set per keystroke)
is now a real constraint against the wanted UX and needs a different search
strategy, not just a client wiring change.

## Action

- [x] Built a single free-text search entry point for add-card, matching across
      name/number/set/type in one pokemontcg.io query (`lib/core/ptcg-search.ts`),
      with live results, plus a persistent manual-entry fallback for a card
      pokemontcg.io hasn't indexed. See ADR-0031.

## Related

- Decision: ADR-0031 (supersedes ADR-0030, the design this feedback corrected)
- Changelog: docs/changelog.d/2026-08-15-add-card-search-and-advanced-filters.md
