---
id: FB-0019
date: 2026-08-21
source: Bart
source-type: stakeholder
severity: 2
sentiment: neutral
status: addressed
tags: [card-add, data, design-system]
---

# Generation is already known from the card, so the add-card form should not ask for it

## What was said

> en bij toevoeen card ligt generatie al vast bij card data dus wanneer je op een
> card klikt hoef je in principe niets zelf over de card i nte vullen behalve of
> je 'm al hebt of niet

English: *"and when adding a card, generation is already fixed in the card data,
so when you click a card you shouldn't in principle have to fill in anything
about the card yourself except whether you already have it or not."*

## Context

`components/custom/CardAddDialog.tsx`, the form shown after a card is chosen from
the search. It currently shows:

- **Rarity** — read-only, taken from the match
- **Type** — read-only, taken from the match
- **Generation** — an editable `InputBase` with a `<datalist>` of previously used
  values, typed by hand
- **In the binder** — checkbox
- **Excluded** — checkbox

So Generation is the last field about *the card itself* that a person still types.

## Interpretation

**The observation is correct and it is not a new principle — it is ADR-0030
applied to the one field it missed.** That record stopped rarity and type being
hand-typed for exactly this reason, and left `gen` alone without saying why.

Verified rather than assumed:

- **The data is already being fetched and thrown away.** `lib/core/ptcg-search.ts`
  requests `select=…,set,…`, so the whole set object comes back, and
  pokemontcg.io's set object carries `series`. Confirmed against the live API:
  `gym2-2` returns `set.series: "Gym"`. `CatalogueMatch` simply does not map it.
- **The vocabularies almost agree.** The catalogue publishes 17 series. Six of
  the seven values in the collection match one exactly: Scarlet & Violet (623
  cards), Sword & Shield (100), Mega Evolution (94), Base (85), Sun & Moon (40).
- **Two do not**, and both are the argument for the change rather than against
  it:
  - `X&Y` on 57 cards, where the catalogue says `XY`.
  - `Scarlett & Violet` on one card — a typo, and the clearest possible evidence
    that a hand-typed field produces hand-typed mistakes.

So the field is not just redundant; it is actively the only place in this flow
where somebody can put a wrong era on a card, and somebody already has.

## Action

- [ ] Map `set.series` into `CatalogueMatch` and fill `draft.gen` from it.
- [ ] Show Generation read-only, beside Rarity and Type, rather than as an input.
- [ ] Decide what happens to the 58 rows whose era does not match the catalogue's
      vocabulary — leaving them makes the era filter show `X&Y` and `XY` as two
      different eras.

## Related

- Decision: ADR-0030 (`0030-tcgdex-source-of-truth-for-rarity-and-type.md`) — the
  same argument, made for rarity and type, and the backfill script that carried
  it out.
- Decision: ADR-0032 — why this dialog does not take manual entry for the card's
  identity.
