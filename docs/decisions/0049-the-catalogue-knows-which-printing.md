---
id: ADR-0049
title: The catalogue knows which printing a copy is, and only the reverse holo takes the foil price
status: accepted
date: 2026-08-16
scope: repo
deciders: [Bart]
superseded-by: null
tags: [pricing, cardmarket, tcgdex, backfill, data-recovery]
---

# The catalogue knows which printing a copy is, and only the reverse holo takes the foil price

## Context and problem statement

ADR-0048 shipped `cards.finish` empty and said the original answers were
unrecoverable: the hand-kept values had been overwritten, the undo journal was
gitignored, and "nothing knows which of two rows is the foil — not acquired_at,
not row order, not rarity any more".

That was true of this database and false of the world. **TCGdex publishes, per
card, which printings exist**: `variants: { normal, reverse, holo, firstEdition,
wPromo }`. Asked about a 210-card sample of this collection, every single card
was determined:

```
127  exists only as holo             -> every copy held is a holo
 37  exists only as normal           -> every copy held is normal
 41  normal and reverse both exist, exactly two copies held
  5  reverse and holo both exist, likewise
  0  ambiguous
```

Run over the whole collection: **1,904 of 1,968 rows resolved, 21 cards left
null.**

Two questions followed. Whether that counts as knowing, and — once it was
applied — why the collection's value went *down* by €2,488.

## Considered options

For the assignment where two printings exist and two copies are held:

1. **Assign one of each, by row id.**
2. **Leave the pair null**, on the grounds that which row is which is unknown.

For pricing a `holo`:

3. **Any foil printing reads Cardmarket's `-holo` fields.** The obvious rule,
   and what ADR-0048 shipped.
4. **Only `reverse-holo` reads them.**

## Decision

(1) and (4).

**(1), because the pair is known even where the row is not.** Nothing records
which of two rows is the reverse holo, and this picks by row id so the choice is
at least stable across runs. What is *not* arbitrary is that the collection holds
one normal and one reverse — so every figure computed from it is exactly right
whichever row got which label. The script is not inventing a fact it lacks; it is
recording a fact about the pair that the catalogue has, in the only shape the
schema offers. A later Notion import can correct the row-level assignment and no
total will move.

Genuinely ambiguous cases — one copy of a card that exists as two printings,
three copies where two exist — are left null and listed in
`docs/finish-backfill-unresolved.md`. Null still means "nobody has said".

**(4), because (3) is measurably wrong.** Cardmarket's `-holo` fields mean *the
foil version of a card that also has a non-foil version*. Against this
collection's products on 16 August 2026:

| | `trend-holo` / `trend` | products |
|---|---|---|
| card also has a normal printing | **1.90×** | 601 |
| card exists only as a holo | **0.47×** | 69 |

For a card with no non-foil version — an Illustration Rare, a V, most of what a
modern set calls a hit — the plain fields *already* describe the holo, because
there is nothing else for them to describe. Whatever `-holo` holds there is a
thinner, different market, and preferring it halves the card.

This was not reasoned out in advance. It was found because the valuation moved
the wrong way after the backfill — €41,616 to €39,128 — and the number was
checked instead of accepted. With the rule corrected the same collection comes to
**€41,766**, €150 above where it started, which is the reverse-holo premium on
305 copies and nothing else.

The imperfect case that remains: a card printed as holo *and* reverse holo with
no plain version, five in the sample, where the holo copy takes the plain price.
That is the answer it got before any of this existed, so nothing regresses.

## Consequences

- Good, because 97% of the collection is classified from a source that knows,
  rather than waiting on an import that may never happen.
- Good, because the undo journal is committed this time
  (`docs/finish-backfill-*.undo.json`), which is the specific thing ADR-0030 got
  wrong and could not take back.
- Good, because `lib/core/card-variants.generated.json` caches the 1,622 lookups,
  so a re-run costs nothing and new cards cost one request each.
- Bad, because **the value series now has a methodology change in it.** The
  2026-08-16 point is computed with finishes; 2024-12-30 and 2026-06-17 are not,
  because the Internet Archive answered 503 for the June capture on the day this
  ran. The step is small (€150 on €41,616, well under the noise between two
  weekly readings) but it is a step for a reason other than the market. Re-running
  `--seed` on a day the archive cooperates recomputes all three on one basis.
- Bad, because a holo *and* reverse holo card with no plain printing is priced
  slightly low. Five in 210, and it is the pre-existing behaviour rather than a
  new error.
- Neutral, because 21 cards stay null. They are listed, and null is a state the
  schema was designed to hold.

## Confirmation

- `lib/core/cards-stats.test.ts` asserts a `holo` copy takes the **plain** price
  and a `reverse-holo` copy takes the foil one. That test was written the other
  way round first and is the one this decision corrected.
- The backfill is a dry run by default and prints exactly what it would set.
- Applied and re-measured end to end: €41,616 before, €39,128 with the wrong
  rule, €41,766 with the right one.
- Not confirmed: the row-level assignment inside a pair. It is arbitrary by
  construction and no figure depends on it.

## Related

- Corrects: ADR-0048's "nothing knows which copy is which" and its
  any-foil-takes-the-holo-price rule. The column, the null semantics and the
  public exclusion all stand.
- Repairs the consequence of: ADR-0030 (the rarity backfill)
- Code: `scripts/backfill-finish.mjs`, `lib/core/cards.ts` (`variantPrice`),
  `lib/core/snapshot.ts`, `scripts/snapshot-collection-value.mjs`,
  `lib/core/card-variants.generated.json`
