---
id: ADR-0031
title: Add-card becomes one search bar over pokemontcg.io, not a set-scoped preview
status: superseded by ADR-0032
date: 2026-08-15
scope: repo
deciders: [Bart]
superseded-by: ADR-0032
tags: [add-card, catalogue, ux, search]
---

# Add-card becomes one search bar over pokemontcg.io, not a set-scoped preview

## Context and problem statement

ADR-0030 (superseded by this record) shipped minutes before this one: it kept the
eight-field add-card form, reordered Set above Name, and added a thumbnail preview
scoped to the typed set. Immediate correction from Bart
(`docs/feedback/0005-add-card-should-be-one-search-bar.md`): "1 invoerveld voor
alles" — one input field for everything, matching name, number, set, and type at
once, with no "pick a set first" gate.

That gate existed for a real reason, restated in both ADR-0030 and the search
route's own comment: TCGdex's catalogue (`lib/core/catalogue.ts`) only resolves one
set at a time, so an unscoped search would mean fetching every set, uncached, per
keystroke. Meeting the corrected ask meant finding a data source that already
indexes across sets, not just relaxing the client-side gate.

pokemontcg.io does this natively — one endpoint, one fielded query
(`name:`, `number:`, `set.name:`, `types:`, combinable with `OR`), searchable
without an account. It was already integrated in this repo (`lib/core/ptcg.ts`,
ADR-0022) as a narrow artwork fallback, but never for search. A live probe against
the real API during this session confirmed the query shape works (`q=name:151* OR
set.name:151*` correctly surfaces the "151" set both by name and by matching cards)
and also surfaced a real risk: ten rapid unauthenticated requests in a row produced
five 500/502 responses. This app has never sent an API key to pokemontcg.io and has
no scaffolding to.

## Considered options

1. **Keep the TCGdex-backed, set-scoped search from ADR-0030, just remove the
   "pick a set first" requirement** — infeasible without either fetching every set
   per keystroke (the exact cost ADR-0030 and the route both rejected) or building
   a new cross-set cache ourselves.
2. **Switch the search backend to pokemontcg.io, unscoped, one field, no
   fallback for a card it doesn't have** — meets the literal ask, but a card
   pokemontcg.io hasn't indexed (a fresh promo, a local/custom entry) would have no
   way into the collection at all, which the app has never required before.
3. **Same pokemontcg.io-backed single search bar, plus a persistent "Enter it by
   hand" escape hatch to the classic Name/Number/Set fields** — chosen.

## Decision

We will replace `/api/v1/catalog/search`'s TCGdex-backed, set-scoped implementation
with `lib/core/ptcg-search.ts`, a pokemontcg.io-backed search across name, number,
set name and type in one query. `CardAddDialog.tsx` opens on a single search input;
live results (image, name, set, number) appear as buttons; clicking one fills Name,
Number, Set, Rarity and Type from the match, replacing the search box with a compact
confirmation row and a "Change" button. A persistent "Can't find it? Enter it by
hand" link reveals the old plain-field form, unconditionally — matching is
enrichment, never a requirement to write a row, the same posture this app has held
since ADR-0008/ADR-0022.

`POKEMONTCG_API_KEY` is added as a new optional env var (`lib/core/env.ts`), sent as
`X-Api-Key` when present, to raise the observed-fragile unauthenticated rate ceiling
— not required to ship, since the feature degrades to "no results, use the manual
fallback" rather than failing outright.

Chosen over option 2 because a search box that cannot add an unlisted card would be
a real regression from every previous version of this dialog, for a data source
(pokemontcg.io) already known in this codebase to sometimes fail to answer at all
(ptcg.ts's own comment: "this host answers 500 and 502 more often than it should").
Chosen over option 1 because it isn't achievable without rebuilding the exact
per-keystroke cost the prior design was built to avoid.

## Consequences

- Good, because the add-card entry point now matches what was actually asked for:
  one box, live results, works for a name, a number, a set, or a type.
- Good, because a picked match now also fills Rarity and Type, which TCGdex's
  catalogue never carried at all (`setCatalogue()` only ever returned `id`,
  `localId`, `name`, `image` — see ADR-0030's own note on this).
- Bad, because the app now depends on an external, unauthenticated-by-default host
  observed to fail roughly half the time under a rapid burst in this session's own
  testing. Mitigated by a debounce (300ms), one retry, a 5-minute cache per query
  string, and — the real fix — the manual fallback, but a `POKEMONTCG_API_KEY` is
  not yet obtained; getting one requires Bart to sign up at pokemontcg.io himself
  (account creation is outside what this session can do on his behalf).
- Bad, because `/api/v1/catalog/search`'s TCGdex-backed test coverage and behavior
  (dedup by id across number forms, asset-base URL construction) is gone — replaced
  wholesale rather than kept alongside, since nothing else in the app called it.
- Neutral, because Gen still has no catalogue source (pokemontcg.io has no
  equivalent field) and stays a manually typed field either way.

## Confirmation

`npm run check` is green (typecheck, `lib/core/ptcg-search.test.ts` and the
rewritten `app/api/v1/catalog/search/route.test.ts`, lint). A `review-accessibility`
pass on the new four-state dialog (search → results → selected-or-manual) found and
fixed: focus silently dropping to `<body>` on every state transition (now moved
explicitly via refs), and a "no matches" message that wasn't announced to screen
readers (now a single persistent `role="status"` region instead of two
conditionally-mounted ones). Not yet exercised end-to-end in a real signed-in
browser this session — see STATE.md's open item.

## Related

- Feedback: FB-0005
- Supersedes: ADR-0030
- Code: `app/components/CardAddDialog.tsx`, `app/api/v1/catalog/search/route.ts`,
  `lib/core/ptcg-search.ts`, `lib/core/env.ts`
