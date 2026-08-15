---
id: ADR-0030
title: TCGdex becomes the source of truth for rarity and type
status: accepted
date: 2026-08-15
scope: repo
deciders: [Bart]
superseded-by: null
tags: [catalogue, data-quality]
---

# TCGdex becomes the source of truth for rarity and type

## Context and problem statement

`cards.rarity` and `cards.types` are facts that originated as a manually-maintained
"Rarity"/"Type" column in Notion, migrated once into Postgres, and never touched by any
catalogue integration since. The Notion adapter itself was removed in ADR-0021, but the
data it produced lives on: `CardAddDialog.tsx` still collects rarity/type as free-text
and chip inputs with no catalogue backing, and CSV import carries them straight through
unchecked. The user asked for both fields to stop being hand-typed/Notion-descended and
instead come from the online Pokémon TCG database, the same way ADR-0022 made
pokemontcg.io the source of truth for artwork after finding the collection's own data
unreliable.

The question: where should rarity/type be resolved from going forward — the collection's
own stored field (as today), or a catalogue — and, if a catalogue, at read time or at
write time?

## Considered options

1. **Keep the status quo** — rarity/type stay hand-typed/CSV-imported, sourced from
   whatever the owner (or, historically, Notion) said.
2. **Live per-request catalogue lookup during collection assembly** — fetch TCGdex detail
   for every card on every collection read and use its rarity/types instead of the
   stored column.
3. **One-time backfill + write-time catalogue source going forward** — resolve
   rarity/types from TCGdex once (a backfill script for existing rows, and again
   whenever a card is added via a new search-and-select flow), write the result into
   `cards.rarity`/`cards.types`, and keep the read path unchanged.

## Decision

We will do option 3. Existing rows are backfilled from TCGdex per-card detail, gated by
the same `numberForms`/`sameCard` match `buildCollection()` already trusts for artwork,
with a worklist doc for anything that doesn't confidently match — the same pattern
ADR-0022 used for artwork, rather than guessing at a rarity/type for an uncertain match.

Going forward, rarity and type stop being editable in `CardAddDialog.tsx`: they are shown,
not asked for, sourced strictly from whatever catalogue match the dialog's own search
resolved. Which catalogue that search calls out to is a separate, parallel decision — see
ADR-0032 — settled independently in favour of pokemontcg.io for the search itself (it
indexes every set behind one query; TCGdex only resolves one set at a time). This ADR is
about what happens to rarity/type once a match exists, not which service finds it.

Chosen because TCGdex's bulk/list endpoint used during collection matching carries no
rarity or types field — only its single-card detail endpoint does. Option 2 would add
roughly 1,600 extra per-card fetches to every collection read, which is exactly the
per-request cost ADR-0014 (cache assembled collection) was written to eliminate. Option 3
keeps the read path exactly as it is today (a Postgres column read), paying the TCGdex
cost once instead of on every request. Option 1 was rejected outright per the user's
explicit ask: the collection's own data has no way to catch a typo or a stale value, and
TCGdex is the source both the web tool and any future consumer should agree with.

Manual rarity/type entry as a fallback for cards TCGdex can't confidently match was also
considered and rejected, per explicit user instruction: all properties on an added card
should come from the clicked catalogue result, not typed around it.

## Consequences

- Good, because rarity/type are now verifiable against an external, versioned source
  instead of a one-time Notion export nobody can re-check.
- Good, because the read path (collection assembly, the public API) is unchanged — no
  new Vercel cost, consistent with ADR-0014.
- Bad, because a card no catalogue has indexed cannot be added through the dialog at all
  — there is no match to click, per ADR-0032. This is an accepted edge case, not solved
  here.
- Bad, because the backfill overwrites ~1,600 rows in one pass; a wrong TCGdex match
  (however unlikely given the `sameCard()` gate) becomes a wrong write, not just a wrong
  read. Mitigated by logging every diff and routing unmatched/uncertain rows to a
  worklist instead of writing them.
- Bad, because the backfill (TCGdex) and the add-card flow going forward (pokemontcg.io,
  per ADR-0032) are two different catalogues, which spell some of the same rarity tiers
  differently ("Ultra Rare" vs. "Rare Ultra"). `poke-holo.css`'s foil-effect selectors
  match on substrings for exactly this reason, rather than an exact string per tier.
- Neutral, because CSV import is left untouched and still accepts manually-typed
  rarity/type columns — out of scope for this decision, revisit separately if it should
  also be locked to catalogue values.

## Confirmation

- The backfill script's diff log and worklist doc are reviewed before being trusted
  against production data.
- After backfill, a handful of cards' rarity/type are spot-checked against TCGdex's own
  site.
- The add-card flow is exercised end-to-end in the browser: search, pick a result, confirm
  rarity and type are shown (not editable) and match the picked card, and the row saves
  correctly.

## Related

- Supersedes: none
- Code: `lib/core/cards.ts` (`getCardDetail`, `buildCollection` matching), `lib/core/catalogue.ts`,
  `app/components/CardAddDialog.tsx`, `scripts/backfill-rarity-types.mjs`
- See also: ADR-0021 (Notion removal), ADR-0022 (artwork's catalogue-source-of-truth
  precedent and audit/worklist pattern), ADR-0014 (per-request catalogue cost), ADR-0032
  (why the add-card search itself calls pokemontcg.io rather than TCGdex)
