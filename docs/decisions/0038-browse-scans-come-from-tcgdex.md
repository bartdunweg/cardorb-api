---
id: ADR-0038
title: Browse swaps pokemontcg.io's PNGs for TCGdex's WebP, per card, after the fact
status: accepted
date: 2026-08-16
scope: repo
deciders: [Bart]
superseded-by: null
tags: [browse, catalogue, performance, images, tcgdex, pokemontcg]
---

# Browse swaps pokemontcg.io's PNGs for TCGdex's WebP, per card, after the fact

## Context and problem statement

ADR-0037 shipped browse on pokemontcg.io. Bart immediately asked the right
follow-up — "hoe voorkomen we dat we teveel data gebruiken?" — so the feature was
measured rather than guessed at:

| | per card | a 207-card set |
|---|---|---|
| JSON from the API | ~0.5 kB | **117 kB** |
| Set list, all 174 | — | **20 kB** |
| pokemontcg.io `small` image | **198 kB** | **40 MB** |

The API side is a rounding error, and so is the third-party request budget: with
`revalidate: DAY` a warm set costs zero requests and the worst realistic day is
175 (every set opened once, cold). **The pictures are three hundred times the
weight of everything else in the feature.**

And the reason is trivial. pokemontcg.io's `small` is a 245×342 **PNG** at
198 kB. TCGdex's `low.webp` is the *same 245×342 picture* at **26 kB**. Same
card, same pixels, 7.6× the bytes, purely a format difference. Both CDNs send
`max-age=31536000`, so this is a first-visit cost — but 40 MB to scroll one set
on a phone is not defensible when 5 MB buys the same screen.

There is a second, softer problem: browse was the only grid in the app not using
the artwork rule the rest of it uses, so a browsed set and the same set in your
collection were visibly different-looking pages.

## Considered options

1. **Leave it; lazy loading already limits the damage.** Rejected as the whole
   answer, kept as part of it. `loading="lazy"` means you only pay for what you
   scroll past, which is most of the mitigation for someone who opens a set and
   looks at the top — but it does nothing for the person who actually browses,
   which is the one this feature is for.
2. **`next/image`.** Rejected on cost, not on merit. Vercel bills image
   optimisation per unique source image; 174 sets × ~200 cards would eat the
   included transformation quota outright. It is also the wrong tool: the file is
   already the right pixel size, only the wrong format, and another catalogue
   already has it in the right format for free.
3. **Move browse to TCGdex entirely.** Rejected — ADR-0037's reasons stand.
   TCGdex's list endpoint has no rarity or types (ADR-0030), so this would trade
   ~36 MB for 207 extra requests per set, and TCGdex's coverage gaps are the
   entire reason `ptcg.ts` exists as a fallback.
4. **Swap the image URLs per card, after pokemontcg.io has answered** — chosen.
5. **Swap the set logos too.** Rejected, measured: TCGdex logos are 8 kB against
   23 kB, so the 174-tile index would save ~2.6 MB — for 174 `setCatalogue()`
   misses, each fetching a whole set's card list to answer a question about one
   logo. ~36 MB for one request here; ~2.6 MB for 174 there. The index keeps its
   PNGs and its lazy loading.
6. **Page or window the web grid.** Rejected: lazy loading already solves what
   paging would solve, and a "load more" costs you the shape of the set, which is
   the point of the screen. The API pages for clients that want it.

## Decision

`lib/core/browse-artwork.ts` (new): `withTcgdexScans(set, cards)` runs after
`setCards()` and replaces `image`/`imageHigh` card by card, wherever TCGdex
demonstrably has the same card. It uses the identical rule `buildCollection()`
already applies to owned cards — `setCatalogue()`'s `byNumber` via
`numberForms()`, gated on `sameCard()`, low/high off the same `assetBase`, and
skipped entirely when `setHasScans` is false. Anything unmatched keeps its PNG.

One extra request per set on a cold cache. `setCatalogue()` is keyed by set name,
cached a day and shared by everyone, and browse already works one set at a time —
so on any set the collection owns cards from, this is a cache hit costing nothing.

**It fails soft**, unlike the rest of the feature. A missing *first* catalogue is
a 502 on the browse routes, because a set with no cards is not an answer. A
missing *second* catalogue only means heavier pictures, and taking a working
screen down to make it smaller would be the wrong trade.

`lib/core/set-aliases.ts` gains `tcgdexSetName()`. Checked against both real set
indexes: 171 of pokemontcg.io's 174 sets resolve to the right TCGdex set on the
name alone. Three do not, and two fail *wrongly* rather than emptily — "Scarlet &
Violet Black Star Promos" and "Scarlet & Violet Energies" both loosely match
TCGdex's "Scarlet & Violet", which would offer base-set pictures for a promo. The
per-card name check catches that anyway; not asking is cheaper than asking and
disbelieving. A gallery always resolves through its parent, because TCGdex lists
a gallery's cards with no image and files the files under the parent's path.

`BrowseSetGrid` gains the same two-strikes `onError` CardItem has: a first
failure retries `low.webp` at `high.webp`, a second gives up to the named slot.

## Consequences

- Good, measured on the real APIs:

  | set | cards | matched | before | after |
  |---|---|---|---|---|
  | Scarlet & Violet 151 | 207 | 207 | 40.0 MB | 5.3 MB |
  | Silver Tempest Trainer Gallery | 30 | 30 | 5.8 MB | 0.8 MB |
  | SV Black Star Promos | 200 | 200 | 38.7 MB | 5.1 MB |

  100% on the two cases named as weakest in ADR-0037's confirmation — a gallery
  set and a promo set — matched on exact name equality, where the shipped code
  uses the looser `sameCard()` and can only do better.
- Good, because browse now resolves artwork the way the rest of the app does, so
  a browsed set and an owned set stop being two different-looking grids.
- Bad, because browse now depends on **both** catalogues where it depended on
  one. Softened by failing soft — TCGdex silent means bigger pictures, nothing
  else — but it is one more thing that can be half-down.
- Bad, because a set nobody owns cards from now costs a `setCatalogue()` miss,
  which fetches a whole set's card list from TCGdex. One request, cached a day,
  shared; the same cost the collection already pays for every set it holds.
- Neutral: the API returns the swapped URLs too, so the iOS app gets the saving
  without doing anything. Clients should still use `image` in grids and
  `imageHigh` only on a detail view — now documented in the README.
- Neutral: the set index still serves pokemontcg.io logos. Deliberate, per
  option 5 above, and worth re-reading that measurement before "fixing" it.

## Confirmation

`npm run check` green — typecheck, 414 tests, lint at `--max-warnings 0`.
`lib/core/browse-artwork.test.ts` covers the swap, the padded/unpadded number
match, the three ways a card keeps its PNG (no TCGdex card, a name mismatch, no
asset base), `setHasScans` false, failing soft on an unreachable TCGdex, the
gallery-resolves-through-parent rule and the promo alias.

Set-name coverage and the byte savings above were computed against the live
pokemontcg.io and TCGdex indexes, not assumed.

One incidental find worth keeping: `beforeEach(() => mock.mockResolvedValue(x))`
is a trap. `mockResolvedValue` returns the mock, a `beforeEach` that returns a
function hands vitest a **teardown callback**, and vitest then calls the mock
with no arguments after every test — surfacing as a phantom call and an
unhandled rejection. Use a block body.

**Still not verified in a signed-in browser** — same standing gap as ADR-0037.

## Related

- Extends: ADR-0037 (browse itself — why pokemontcg.io answers "what is in this
  set", which this does not change).
- Builds on: ADR-0030 (TCGdex's list endpoint has no rarity or types — why this
  is a swap and not a source change), ADR-0022 (a number can belong to another
  card — why every swap is name-checked), ADR-0014 (why one cached request per
  set is the acceptable shape and 174 of them is not).
- Prompted by: Bart, directly — "hoe voorkomen we dat we teveel data gebruiken?"
- Code: `lib/core/browse-artwork.ts`, `lib/core/set-aliases.ts`,
  `app/api/v1/catalog/sets/[setId]/route.ts`,
  `app/(app)/collection/browse/[setId]/page.tsx`,
  `app/components/BrowseSetGrid.tsx`
