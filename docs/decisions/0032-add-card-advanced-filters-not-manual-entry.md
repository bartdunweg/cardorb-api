---
id: ADR-0032
title: Add-card's fallback is advanced filters, not manual unmatched entry
status: accepted
date: 2026-08-15
scope: repo
deciders: [Bart]
superseded-by: null
tags: [add-card, catalogue, ux, search]
---

# Add-card's fallback is advanced filters, not manual unmatched entry

## Context and problem statement

ADR-0031 (superseded by this record, but only partly — see Consequences) shipped a
single quick-search box for add-card, backed by pokemontcg.io, with a persistent
"Can't find it? Enter it by hand" link as a fallback: it revealed the dialog's old
free-text Name/Number/Set fields, letting a card be written with no catalogue match
at all. That fallback existed specifically because pokemontcg.io sometimes fails
(observed directly this session: five 500/502s out of ten rapid unauthenticated
requests) or simply hasn't indexed a card (a fresh promo, a custom variant).

Immediate correction from Bart: "enter it by hand moet geen optie zijn, het is meer
gebruik advanced filters" (FB-0006) — that fallback should not exist. The
alternative to the quick box should still be a search, just a more precise one.

## Considered options

1. **Keep the manual-entry fallback as shipped** — rejected outright by Bart, not
   under consideration as a live option here.
2. **Remove the fallback with nothing in its place** — the quick box alone, no
   escape hatch at all for an ambiguous or hard-to-phrase search.
3. **Replace it with "Advanced filters": explicit Name/Number/Set/Type fields,
   each a targeted clause in the same pokemontcg.io query, still requiring a result
   to be picked before Rarity/Generation/Type/submit appear** — chosen.

## Decision

We will remove the manual Name/Number/Set entry path entirely from
`CardAddDialog.tsx`. `lib/core/ptcg-search.ts` gains `SearchFilters` and
`buildFilterQuery()` alongside the existing `buildQuickQuery()`; `searchCards()`
now accepts either a free-text term or a `SearchFilters` object, and
`/api/v1/catalog/search` switches into filter mode whenever any of `name`/
`number`/`set`/`type` is present, ignoring `query` if so. The dialog gets a
`mode: "quick" | "advanced"` toggle instead of the old `manual` boolean; both
modes feed the same live results grid, and a card can only be added by picking a
result — there is no path left that writes an unmatched row.

Chosen over option 2 because "charizard" alone returns dozens of printings across
sets; a way to narrow precisely (a fielded search) earns its place even without a
raw-entry escape hatch behind it. Chosen over option 1 because Bart rejected it
directly and specifically, not as a style preference.

## Consequences

- Good, because the dialog no longer has a path that writes a name/set nobody
  confirmed against anything — closer to the spirit of ADR-0022's "wrong is worse
  than missing" than the manual fallback ever was, applied one step earlier (to
  whether a row gets written unmatched at all, not just to which scan shows).
- Good, because advanced filters answer a real, different need than the escape
  hatch did: not "the catalogue doesn't have this card" but "the quick box is
  matching too broadly, and I know exactly which field to narrow."
- Bad, and explicitly accepted: **a card pokemontcg.io has not indexed can no
  longer be added through this dialog at all.** ADR-0031 named this exact
  consequence as a reason to reject a fallback-less design; Bart chose it anyway,
  knowingly, and that is what this record exists to make legible later rather than
  read as a regression nobody decided.
- Neutral, because ADR-0031's core call — pokemontcg.io as the search backend
  instead of TCGdex, one query across name/number/set/type — is unaffected and
  does not need re-deciding; only its fallback design is superseded here.

## Confirmation

`npm run check` is green (typecheck; `lib/core/ptcg-search.test.ts` and
`app/api/v1/catalog/search/route.test.ts` extended for the filters path; lint).
A follow-up accessibility check confirmed the quick/advanced mode toggle carries
focus correctly in both directions (reusing the ref-based pattern ADR-0031's own
accessibility pass established) and that the duplicated "Type" label (a filter
input vs. a chip fieldset later in the flow) never renders concurrently. Not
exercised end-to-end in a real signed-in browser this session — see STATE.md.

## Related

- Feedback: FB-0006
- Supersedes: ADR-0031 (partially — see Consequences)
- Code: `app/components/CardAddDialog.tsx`, `app/api/v1/catalog/search/route.ts`,
  `lib/core/ptcg-search.ts`
