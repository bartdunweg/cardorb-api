---
id: ADR-0081
title: The era comes from the catalogue too, and the collection is renamed to match
status: accepted
date: 2026-08-21
scope: repo
deciders: [Bart, Claude]
superseded-by: null
tags: [card-add, data, catalogue]
---

# The era comes from the catalogue too, and the collection is renamed to match

## Context and problem statement

> ligt generatie al vast bij card data dus wanneer je op een card klikt hoef je
> in principe niets zelf over de card in te vullen behalve of je 'm al hebt of
> niet — FB-0019

Correct, and it is not a new principle: it is ADR-0030 applied to the one field
that record missed. That decision stopped rarity and type being hand-typed
because they are facts about the card rather than judgements about the copy. An
era is the same kind of fact, and it was still a text box with a `<datalist>`.

Verified rather than assumed:

- **The data was already being fetched and discarded.** `ptcg-search.ts` requests
  `select=…,set,…`, and pokemontcg.io's set object carries `series`. Confirmed
  live: `gym2-2` returns `set.series: "Gym"`. `CatalogueMatch` simply did not map
  it.
- **The vocabularies almost agree.** The catalogue publishes 17 series; six of
  the seven values in the collection matched one exactly.
- **Two did not, and both argue for the change.** `X&Y` where the catalogue says
  `XY`, and a single `Scarlett & Violet` — a typo, which is what a text box is
  for.

## Decision

**`gen` is filled from `set.series` and shown read-only, beside Rarity and
Type.** Three facts about the card, none of them typed. The only things left to
answer are the two that are genuinely about the copy: whether it is in the binder
and whether it is excluded from the latest pull.

**The 70 rows that disagreed were renamed to the catalogue's spelling**, by
`scripts/backfill-generations.mjs` — the same shape as ADR-0030's backfill, with
a dry run by default. Applied to production and re-counted: `X&Y` 69 → 0, `XY`
0 → 69, `Scarlett & Violet` 1 → 0.

Leaving them was the alternative and it is the one that quietly breaks: the era
filter would list `X&Y` and `XY` as two different eras, one of which stops
growing.

## Alternatives considered

- **Translate the catalogue into the collection's words (`XY` → `X&Y`).** Keeps
  existing rows untouched and makes this repo the authority on spelling, which is
  exactly the position ADR-0030 moved away from. It also needs a mapping table
  that has to be maintained against a source that will add series.
- **Fix the typo only, leave `X&Y`.** Half the problem, and the half that leaves
  two eras in the filter.
- **Re-look up every card's era from the catalogue**, as ADR-0030's backfill did
  per card. Rejected: rarity and type are per-card facts nothing local could
  derive, whereas these two are spelling differences on otherwise identical
  values. 1,960 round trips buy nothing two string replacements do not.

## Consequences

- The add-card form has no free-text field about the card left. `fields.gens` —
  the datalist of previously used eras — has no reader in the dialog any more.
- **A card whose set the catalogue gives no series for records an empty era**,
  shown as "Unknown". Previously somebody could have typed one. That is the same
  trade ADR-0030 accepted for rarity.
- The counts in this record were re-measured after a first attempt undercounted:
  a plain PostgREST select is capped, so the first distribution read 57 `X&Y`
  where there are 69. **Counted from `Content-Range` with `Prefer: count=exact`**
  in the script, for that reason.
- **Not measured:** how the read-only row looks. The screenshot harness is off
  (ADR-0069) and this dialog needs a signed-in session.

## Related

- `docs/decisions/0030-tcgdex-source-of-truth-for-rarity-and-type.md` — the same
  argument, and the backfill this one copies.
- `docs/feedback/0019-generation-is-known-so-do-not-ask-for-it.md`.
