---
id: ADR-0048
title: A copy records which printing it is, and null is not "normal"
status: accepted
date: 2026-08-16
scope: repo
deciders: [Bart]
superseded-by: null
tags: [pricing, schema, cardmarket, data-loss]
---

# A copy records which printing it is, and null is not "normal"

## Context and problem statement

Cardmarket publishes two price sets per product: the plain fields, and their
`-holo` twins for the foil printing — the modern reverse holo, and the holo rare
on older sets. TCGdex passes both through. This app used only the first, so
every reverse holo in the collection was valued at the price of its normal twin.

It is not a rounding difference. Measured against this collection's 1,526
products on 16 August 2026: **660 carry a real foil price and the foil runs at a
median of 2.0× the normal printing**. (An earlier measurement of "1,525 of 1,526,
at 1.55×" was wrong: it counted `trend-holo: 0` as a price. 865 products answer
zero, which is Cardmarket saying it has no foil listing rather than saying the
foil is free — a distinction that matters enough to have its own function.)

323 cards here are held as two rows, which is almost always a normal printing and
its reverse holo. Both were priced the same.

**The information existed and was lost.** It was kept in `rarity`. The surviving
evidence is two rows still reading `Reversed Holo` and two reading `Non-holo`,
beside ten spelled `Illustration Rare` where the other 485 read
`Illustration rare` — the case split is the fingerprint of hand-kept values that
survived. The ADR-0030 backfill replaced that column with TCGdex's vocabulary,
which describes *the card* and not *the copy*, and those are different questions
that happened to share a column. The backfill wrote an undo journal for exactly
this eventuality; `.gitignore` matches `docs/rarity-backfill-*.undo.json`, so it
was never committed, and it is not on this machine. The original answers are
gone from here. They may still be in Notion.

## Considered options

1. **A `finish` column, nullable, null meaning "not recorded".**
2. **A `finish` column defaulting every existing row to `'normal'`**, which is
   what "make them all normal" most directly means.
3. **Infer the finish for the 323 two-row cards** — call the second row the
   reverse holo.
4. **Recover from `rarity`'s survivors** and leave the rest.

## Decision

(1), plus the pricing that makes it worth having:
`holoPriceOf()` beside `priceOf()`, `priceHolo` on `OwnedCard`, `finish` on
`Variant`, and `variantPrice(card, variant)` as the single sentence that picks
between them. Both value paths use it — `heldValue()` for the tile,
`snapshotOf()` for the chart — because those two numbers sit one above the other
on the same screen.

**Null rather than `'normal'`, and this is the decision worth defending.** The
outcome today is identical: null is priced as normal. What null keeps is the
difference between "nobody has said" and "somebody looked and said normal". A
later import — from Notion, where the original answers may still be — can fill
blanks without overwriting a judgement made since. Writing a confident `'normal'`
into 1,969 rows would destroy that distinction, which is precisely the mistake
being repaired here, made a second time and harder to undo. It is the same rule
this codebase keeps arriving at: an empty collection and an unreachable one are
different sentences.

(3) was rejected outright and is the one worth naming. Nothing records which of
two rows is the foil. `acquired_at` does not know, row order does not know, and
`rarity` no longer knows. An inference here would write a guess into the column
whose entire purpose is to hold a fact, and it would be indistinguishable from a
real answer the moment it was written.

(4) recovers four rows out of 1,969 and leaves the column half-trustworthy. Not
worth the special case; those four will be picked up by the same import as
everything else.

**Zero is not a price.** `holoPriceOf()` exists as a separate function rather
than a flag on `priceOf()` because of this alone: 865 of 1,526 products publish
`trend-holo: 0`, and reading that literally values a reverse holo at nothing —
worse than the approximation this replaces. It returns null there, and the caller
falls back to the normal price, which is the honest answer for a card Cardmarket
does not distinguish.

**`finish` is not published.** `forPublic()`'s allow-list refuses it, like the
rest of the inventory fields (ADR-0045). It is a fact about somebody's copy, and
the public payload carries no prices for it to be the key to.

## Consequences

- Good, because a reverse holo can finally be worth what a reverse holo is worth,
  and the tile and the chart agree on it because they share `variantPrice()`.
- Good, because the API takes it now — `POST /v1/cards` and
  `PATCH /v1/cards/:id` — so the iOS app and any future import can write it
  without further schema work.
- Bad, because **nothing sets it today, so nothing changes today.** There is no
  web UI for it — and that is not an omission in this change: there is no web UI
  for `quantity`, `condition`, `grade`, `purchasePrice` or `isFavorite` either.
  All five are writable only through the API, which is why all five are empty
  across all 1,969 rows. `finish` joins a column family the web app has never
  offered a way to fill.
- Bad, because the original answers are unrecoverable from this repo. The route
  back is Notion.
- Neutral, because a pre-priced set (`CATALOGUE_SET_PRICING_MAX` above 0) has no
  foil figure and falls back to the normal price: that Record has one slot per
  card and widening it wants its own cache version bump. Invisible while
  pre-pricing is off, which is the default.
- Neutral, because `Variant` gained a field, so every fixture that builds one had
  to be updated — the allow-list test in `cards-public.test.ts` caught the public
  payload immediately, which is what it was written for.

## Confirmation

- `lib/core/cards-price.test.ts` covers `holoPriceOf` directly, including that
  `trend-holo: 0` is null and not free, and that a zero on one field does not
  discard a real figure on another.
- `lib/core/cards-stats.test.ts` covers a card held as both printings coming to
  the sum of two different prices (30, where it used to be 20), a holo rare
  priced like a reverse holo, the fallback where Cardmarket has no foil listing,
  and an unclassified copy priced as normal rather than as a foil or as nothing.
- Not confirmed: any real row with a finish set, because none exists yet.

## Related

- Repairs: ADR-0030 (the backfill that overwrote the hand-kept values)
- Context: ADR-0044 (copies, and why each printing is counted), ADR-0045 (the
  public allow-list this field is deliberately kept out of), ADR-0008 (the
  per-variant inventory fields it joins)
- Code: `supabase/migrations/20260816200000_printing_finish.sql`,
  `lib/core/price-basis.mjs` (`holoPriceOf`), `lib/core/cards.ts`
  (`variantPrice`, `priceHolo`), `lib/core/cards-stats.ts` (`heldValue`),
  `lib/core/snapshot.ts`, `lib/core/collection-row.ts` (`Finish`)
