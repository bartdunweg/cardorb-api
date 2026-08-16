---
id: ADR-0041
title: TCGdex's vocabulary, without exceptions — including the card-type suffix and the coarser rarity tiers
status: accepted
date: 2026-08-16
scope: repo
deciders: [Bart]
superseded-by: null
tags: [data-quality, catalogue, tcgdex, rarity, naming]
---

# TCGdex's vocabulary, without exceptions — including the card-type suffix and the coarser rarity tiers

## Context and problem statement

ADR-0040 established the split — the catalogue owns what a card *is*, the
collection owns what is true of you — and then carved two exceptions out of it,
both on the grounds that the stored value looked better than the catalogue's:

1. **The card-type suffix.** The collection wrote "Pikachu" where TCGdex writes
   "Pikachu ex". Read as house style, backed by `matching.ts` having been
   widened years ago to tolerate exactly that difference. 179 rows left alone.
2. **The rarity vocabulary.** With the row-paging bug fixed,
   `backfill-rarity-types.mjs` wanted to change 956 of 1,938 rows, and some of
   those were visibly *downgrades*: `"Special Illustration Rare"` →
   `"Ultra Rare"` spends a real distinction, `"Illustration Rare"` →
   `"Illustration rare"` is only casing. Left as an open question.

Bart closed both, in the same terms he had used to open ADR-0040:

> "Als TCGdex 'Pikachu X' zegt, dan moeten wij dat ook zeggen. Dus fix dat ook
> allemaal maar"
> "Wat ik bewust níét gedaan heb -> dat maar ook gewoon doen en tcgdex
> standaarden volgen svp"

## Considered options

1. **Keep both exceptions.** Rejected by the above, and it was the weaker
   position anyway: an exception justified by "the stored value looks better"
   is a per-field aesthetic judgement, and there are as many of those as there
   are fields. The point of naming a source of truth is to stop having the
   argument.
2. **Keep the rarity exception only**, on the grounds that it loses information
   where the suffix one does not. Rejected: it is genuinely lossy, and that is
   the price. One vocabulary that is coarse in places beats two vocabularies
   that are each right in different places — the collection is *read* by code
   that has to match on rarity strings, and code cannot weigh which spelling was
   nicer.
3. **Follow TCGdex everywhere** — chosen.

## Decision

No exceptions. `scripts/audit-collection.mjs` compares names in full rather than
with the suffix stripped, and writes exactly what the catalogue says.
`scripts/backfill-rarity-types.mjs` runs, and now writes an undo journal first,
the way the audit already did.

Applied: **293 names** and **956 rarity/type pairs**. Both re-run to confirm zero
remaining differences.

The suffix change is less of a reversal than it first reads. Nothing hand-types
a name any more — the add dialog writes whatever the catalogue match said
(ADR-0030, ADR-0032, ADR-0037's prefill) — so those 179 rows were not a
convention being maintained, they were rows predating the rule. This makes the
old ones look like the new ones.

## Consequences

- Good: one vocabulary across 1,968 rows, and both scripts now report zero
  differences against TCGdex. A rarity string in the database is now something
  code can match on without a translation table.
- Good, and unforeseen: it *fixed* the foil. `poke-holo.css` matches rarity by
  substring, and the collection previously held a mixture of vocabularies —
  after the backfill, 485 rows read "Illustration rare" and pick up the
  full-strength foil tier they should always have had.
- Bad: `"Special Illustration Rare"` is gone, folded into `"Ultra Rare"`. That
  is a real distinction spent knowingly. If it is ever wanted back, it has to
  come from a catalogue that draws it, not from the rows — they no longer
  remember. The undo journals from this session are the only record, and they
  are gitignored and local.
- Bad: the collection now says "Pikachu ex" where its owner would say "Pikachu".
  Accepted as the cost of not having a per-field style argument.
- Neutral: `sameCard()`'s suffix tolerance is now mostly unnecessary, since both
  sides carry the suffix. Deliberately left in place — it costs nothing, and it
  is what makes a hand-entered or CSV-imported row still match.
- Neutral: `speciesOf()` was checked *before* running rather than after.
  It finds a Pokémon by substring, longest first, so "pikachuex" still resolves
  to Pikachu and "mewtwoex" to Mewtwo rather than Mew. Twelve suffixed names —
  including the `&` GX pairs and the hyphenated `-EX` — all keep their Pokédex
  place.

## Confirmation

Both scripts run against the live collection with `--write`, each preceded by an
undo journal, each re-run afterwards: audit reports 0 in classes A and B, rarity
backfill reports `0 of 1938 matched rows differ from TCGdex`.

One real bug found by checking the consequences rather than assuming them: the
new vocabulary put `"Non-holo"` into the collection, which **contains the
substring "holo"**, so `poke-holo.css`'s `[data-rarity*="holo"]` would have
given a foil to the two cards whose rarity is the word for not having one. The
first fix was wrong in an instructive way — an earlier rule with identical
specificity, which the later substring rule still beats. It is a `:not()` now,
so it is order-proof. That is ADR-0012's cascade trap in miniature, found
because the rarity vocabulary changing meant every rarity-keyed selector had to
be re-checked.

30 rows still need a person (ADR-0040's floor, unchanged by this).

## Related

- Supersedes: ADR-0040's two exceptions — the suffix as house style, and the
  rarity backfill left open. The rest of ADR-0040 stands.
- Generalises: ADR-0030, which chose TCGdex for rarity and types, to the whole
  vocabulary without carve-outs
- Cascade trap: ADR-0012
- Code: `scripts/audit-collection.mjs`, `scripts/backfill-rarity-types.mjs`,
  `app/styles/poke-holo.css`
