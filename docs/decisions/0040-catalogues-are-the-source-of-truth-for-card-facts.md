---
id: ADR-0040
title: The catalogues are the source of truth for what a card is; the collection is the source of truth for owning it
status: accepted
date: 2026-08-16
scope: repo
deciders: [Bart]
superseded-by: null
tags: [data-quality, catalogue, tcgdex, scripts, matching]
---

# The catalogues are the source of truth for what a card is; the collection is the source of truth for owning it

## Context and problem statement

Card Orb's rows are hand-kept and have been for years, so some of them are
wrong. The app already knew which ones: `buildCollection()` refuses a card its
scan when the number resolves to a different Pokémon, on the rule that a wrong
picture is worse than a missing one (ADR-0022). It then threw that knowledge
away — the row got an empty slot, and nothing recorded *why*.

Two hand-written worklists came out of that, both compiled by a person reading
tables: `docs/trainer-gallery-row-corrections.md` (23 gallery rows filed under
another card's number) and `docs/rarity-type-backfill-corrections.md`. Browse
(ADR-0037) made the first list visible rather than merely true — a gallery set's
grid shows two grey slots where one owned card should be, because the row is at
the wrong number and the right number is empty.

Bart, asked whether to fix those 23 rows by hand, widened it:

> "ik heb misschien foutjes in mn collectie en die moeten van api's enzo"
> "Wat we gebruiken als API's, dat is de source of truth."
> "Dank jij mag van mij beslissen hoe je het doet."

So the question is not "fix 23 rows" but "what is authoritative, and how does a
row get corrected when it disagrees".

## Considered options

1. **A one-off script for the 23 known rows.** Rejected — it fixes a symptom,
   deletes itself, and the next batch of typos needs another person-week of
   table-reading. It also cannot find errors nobody has noticed.
2. **Correct rows in the app, by hand, as they are spotted.** Rejected: 1,968
   rows, and the errors are invisible precisely because the app's response to
   one is to show nothing.
3. **A repeatable audit that reconciles the whole collection against the
   catalogue, proposes corrections, and applies only the ones it can prove** —
   chosen.
4. **Have the audit correct everything it finds, including where several cards
   fit.** Rejected. A Blaziken at TG12 really could be TG14 Blaziken V or TG15
   Blaziken VMAX, and only the card in someone's hands decides. Guessing here
   writes a confidently wrong row, which is the failure mode ADR-0022 exists to
   avoid, done at scale.

## Decision

**The split.** A catalogue owns what a card *is* — its name, its number, its
rarity, its types, its artwork. The collection owns what is *true of you* — that
you have it, how many, what you paid, whether it is on the wishlist. Where the
two disagree about the first kind of fact, the catalogue wins. ADR-0030 already
made this call for rarity and types; this generalises it to name and number, and
names the principle so it stops being re-decided per field.

**The mechanism** is `scripts/audit-collection.mjs`: every row, matched against
TCGdex the same way `buildCollection()` matches it — imported from `lib/core`,
not reimplemented — sorted into four outcomes:

- **A, misspelling.** The number matched and `sameCard()` agreed, so identity is
  already established and only the spelling moves. Fixed.
- **B, wrong number.** The number resolves to a different card, but exactly one
  card in the set carries this name. Fixed.
- **Ambiguous.** Several candidates. Never touched; written to a worklist.
- **Unplaceable.** The catalogue has nothing by this name in this set. Never
  touched; written to a worklist.

Dry run by default. `--write` applies A and B only, after writing every previous
value to an undo journal (gitignored) so a bad run is reversible.

**Two narrowing rules earn their place**, because both convert "a human must
decide" into "this is provable":

- *Same run.* A row at `TG08` is a gallery card whatever else is wrong with it.
  The letter prefix is the one part of a wrong number that stays reliable — it
  says which run of the set the card came from, not where in it. Narrowing to
  same-prefix candidates resolved 10 of 22 ambiguities, and agreed with the
  human worklist on every one.
- *Same words, wrong order.* "Urshifu Single Strike" at TG18, where the card is
  "Single Strike Urshifu V". `sameCard()` refuses it and should — reordering
  words is how Mew would start matching Mewtwo — but the number already resolved
  to this card in this set, and the names are the same multiset of words. That
  is an observation, not a guess.

**Two things the audit must not do**, both learned by running it:

- *The card-type suffix is house style, not an error.* This collection files
  "Pikachu" where TCGdex says "Pikachu ex", and `matching.ts` was widened years
  ago to tolerate exactly that. The first version of this script compared full
  names and proposed 179 "corrections" that were all suffix. It would have
  rewritten a fifth of the collection into a convention nobody chose. Names are
  now compared with the suffix stripped from both sides — including the
  hyphenated form older sets use ("Yveltal-EX") — and a correction keeps the
  row's own convention.
- *Read all the rows.* PostgREST caps a response at 1000 and says nothing. The
  first run reported "1000 rows" for a 1,968-row collection and gave a clean
  bill of health to rows it had never looked at. `lib/storage/postgres.ts` has
  carried the paging loop and an explicit short-read throw from the start;
  `scripts/backfill-rarity-types.mjs` did **not**, and has therefore been
  backfilling half this collection since it was written. Both scripts carry it
  now.

## Consequences

- Good: 21 rows corrected, verified. 1,917 → 1,938 rows agreeing with TCGdex,
  and a second run reports zero remaining in the auto-fixable classes. Each of
  those rows gets back its artwork, its price, its detail page and its place in
  prev/next navigation — the number is what all four are looked up by.
- Good, and the reason to trust it: on Silver Tempest the script proposed 13
  corrections and all 13 are identical to the hand-compiled worklist, including
  agreeing on which two are undecidable. It reproduced a person's work from the
  same evidence.
- Good: `docs/trainer-gallery-row-corrections.md` is deleted, its rows either
  fixed or regenerated into `docs/collection-audit-corrections.md`, which is now
  a build output rather than something maintained by hand.
- Bad: 30 rows still need a person — 12 ambiguous, 18 the catalogue cannot
  place. That is the honest floor of this approach, not a gap to close with a
  cleverer heuristic.
- Bad: the audit is a script run by hand with a service-role key, not something
  the app does. Fine for a cleanup; it means nothing stops a *new* typo from
  being entered tomorrow. The add-card dialog already prevents most of that by
  refusing unmatched rows (ADR-0032), so the remaining source is CSV import.
- Neutral: the app caches rows for an hour under `cards:<userId>`, and a script
  writing straight to Postgres does not revalidate that tag. The corrections
  appear within the hour, or immediately after any write through the app.
- **Open, deliberately not decided here:** with the paging bug fixed,
  `backfill-rarity-types.mjs` now wants to change **956 of 1,938 rows**, and a
  sample shows some of those are downgrades — `"Special Illustration Rare"` →
  `"Ultra Rare"` loses a distinction the row currently has, and
  `"Illustration Rare"` → `"Illustration rare"` is only casing. ADR-0030's
  "TCGdex is the source of truth" argues for running it; the evidence argues
  that TCGdex's rarity vocabulary is coarser than what is already stored. Not
  run. It needs a decision about which rarity vocabulary the app wants, which is
  a product question, not a data-cleanup one.

## Confirmation

Run against the live collection (1,968 rows, 52 sets). Dry run, reviewed, then
`--write`, then re-run to confirm: zero remaining in classes A and B. Undo
journals written before each of the two write runs.

The 179-suffix mistake and the 1000-row truncation were both caught *by* the dry
run, before anything was written — which is the argument for the dry run being
the default rather than a flag.

## Related

- Generalises: ADR-0030 (rarity and types from TCGdex) to name and number
- Applies: ADR-0022 (a number that resolves to another card is not to be
  trusted) as a correction rather than only as a refusal
- Made visible by: ADR-0037 (browse shows the gap where a mis-numbered card
  should be)
- Catalogue choice constrained by: ADR-0039 (TCGdex is free and unmetered)
- Code: `scripts/audit-collection.mjs`, `scripts/backfill-rarity-types.mjs`
- Deletes: `docs/trainer-gallery-row-corrections.md`
