---
id: FB-0006
date: 2026-08-15
source: Bart
source-type: stakeholder
severity: 3
sentiment: negative
status: addressed
tags: [add-card, ux, search]
---

# The add-card manual-entry fallback should not exist; the alternative to quick search should be advanced filters

## What was said

> "enter it by hand moet geen optie zijn, het is meer gebruik advanced filters"

English: "'enter it by hand' shouldn't be an option — it's more [like] using
advanced filters."

## Context

Minutes after ADR-0031 shipped: `CardAddDialog.tsx`'s "Can't find it? Enter it by
hand" link, which reveals the old free-text Name/Number/Set fields and lets a card
be written with no catalogue match at all — the escape hatch ADR-0031 built
specifically because pokemontcg.io sometimes fails or doesn't index a card.

## Interpretation

Bart is rejecting that escape hatch outright, not asking for it to be relabeled.
The alternative to the one-box quick search should still be a *search* — explicit
Name/Number/Set/Type fields feeding the same catalogue query, more precise than one
free-text box — not a way to skip search and hand-type an unmatched row. This
knowingly reverses part of ADR-0031's own stated reasoning (rejecting "a search box
that cannot add an unlisted card" as a regression): after this change, a card
pokemontcg.io has not indexed genuinely cannot be added through this dialog. That is
an accepted tradeoff, not an oversight — recorded here so it reads as a decision
later, not a bug.

## Action

- [x] Replaced the manual-entry fallback with an "Advanced filters" mode:
      explicit Name/Number/Set/Type inputs that build a fielded catalogue query
      (`lib/core/ptcg-search.ts`/pokemontcg.io), still requiring a result to be
      picked before the row can be submitted. See ADR-0032.

## Related

- Decision: ADR-0032 (supersedes ADR-0031's fallback design)
- Changelog: docs/changelog.d/2026-08-15-add-card-search-and-advanced-filters.md
