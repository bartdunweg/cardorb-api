---
id: ADR-0022
title: Gallery artwork comes from pokemontcg.io, and is checked against the row's name
status: accepted
date: 2026-08-15
scope: repo
deciders: [Bart]
superseded-by: null
tags: [artwork, catalogue, matching, data-quality]
---

# Gallery artwork comes from pokemontcg.io, and is checked against the row's name

## Context and problem statement

Auditing what the public "latest pull" endpoint could return (ADR-0021) meant counting the
cards with no artwork. Of 1,645 cards, 35 have none, and 26 of those are owned. **23 of
the 26 are Trainer Gallery cards** — `TG04`–`TG20` across Silver Tempest, Lost Origin and
Brilliant Stars.

They fail three sources at once:

- **TCGdex** has the records but publishes no scans for `*tg` sets: every card in
  `swsh12.5tg` has `image: null`, the set detail has no logo so `assetBase` is null, and
  `assets.tcgdex.net/en/swsh/swsh12.5tg/TG04/low.webp` is a 404.
- **Limitless** renumbers gallery cards into the parent set's run, so there is no address
  to build. `lib/core/catalogue.ts` had already decided not to guess that offset, and
  `lib/core/cards.ts` enforced it with `!/^[A-Za-z]/.test(number)`, which skipped the
  fallback path entirely for a `TG` number.
- **pokemontcg.io** was never reached, because that same letter check gated both fallbacks
  together even though only one of them needed gating.

pokemontcg.io does publish them, as sets of their own, addressed by the printed number:
`images.pokemontcg.io/swsh12tg/TG04.png`. All 23 were verified to return 200. So the fix
looked like a two-line change — until the numbers were checked.

**Twenty-one of the 23 are filed under a number that belongs to a different card**, and
the other two under a name no catalogue uses. The collection has Druddigon at `TG04`;
both catalogues, independently, have Druddigon at `TG09` and Jynx at `TG04` — and the
printed card settles it, since the Silver Tempest Jynx carries `TG04/TG30` in its corner.
So the naive fix would have replaced 21 empty slots with 21 pictures of the wrong Pokémon,
which is precisely the failure `catalogue.ts` declined to risk with Limitless. The
remaining two (Brilliant Stars `TG18`/`TG20`) have the right number and a reversed name,
"Urshifu Single Strike" for "Single Strike Urshifu V"; `sameCard()` looks past the `V` but
will not reorder words, and should not.

## Considered options

1. **Ship the pokemontcg.io lookup as-is.** Rejected: 23 confidently wrong scans. "A wrong
   scan is worse than a missing one" is already this codebase's rule
   (`lib/core/cards.ts`, `lib/core/catalogue.ts`).
2. **Drop the whole idea and treat it as a data problem only.** Rejected as insufficient:
   correcting the numbers in Notion is necessary but not sufficient, because TCGdex has no
   gallery scans at all. With correct numbers and no code change, those 23 cards stay
   blank.
3. **Look the card up by name instead of by number**, ignoring what the row says its
   number is. Rejected. It resolves 16 of 23 uniquely, but 5 are ambiguous (a row filed as
   "Blaziken" matches both `TG14 Blaziken V` and `TG15 Blaziken VMAX`) and 2 do not match
   at all ("Urshifu Single Strike" against "Single Strike Urshifu V"). More importantly it
   inverts this codebase's matching contract — `sameCard()` says of itself that it decides
   "whether a number that already lined up is believable", not which card a name means —
   and it would hide bad rows rather than surface them. Those same wrong numbers also
   break pricing, the card detail page and prev/next navigation, none of which a
   name-first artwork lookup would fix.
4. **Lift the gate for pokemontcg.io only, and check the row's name against their card
   list before believing the number.** Chosen.

## Decision

Split the letter check so it guards Limitless alone (`lib/core/cards.ts`), and let a
gallery number through to `ptcgScan`.

In `lib/core/ptcg.ts`, a gallery number (`TG…`/`GG…`) resolves against the gallery subset
rather than the parent, found by prefix the same way `resolveSetIds()` finds it at TCGdex.
Before the URL is built, the number is checked against that set's card list — one extra
request per gallery set, cached for a day — and accepted only if `sameCard()` agrees the
number holds the card the row names. No name, no card list, or a different card: the empty
slot stays.

The parent-set path is unchanged and unchecked. Its numbers are the collection's own and
have been trusted for years; only the gallery numbering is known-bad.

## Consequences

- Good, because it cannot show a wrong card. That is the property that made this shippable
  at all, and it is the same guard `buildCollection()` puts on a TCGdex match.
- **Bad, and the honest headline: today this changes nothing visible.** All 23 rows still
  show an empty slot, because the rows themselves are wrong. The mechanism is in place and
  correct; the data is not. Each corrected row gains its artwork automatically on the next
  build — and the corrected ones will mostly not even need this path, since a number that
  lines up matches TCGdex directly.
- Good, because those 23 rows are now known and listed rather than a silent gap, and
  correcting them in Notion also restores their price, their detail page and their place
  in prev/next navigation — none of which an artwork workaround would have touched.
- Neutral, because a gallery set costs one extra cached request. Only gallery numbers
  trigger it; there are five such sets in this collection.
- Supersedes the conclusion — not the reasoning — of the comment in `lib/core/catalogue.ts`
  that gallery cards TCGdex has no scan for "keep their empty slot". The reasoning about
  Limitless's offset still holds and is still enforced.
- The three remaining owned cards with no artwork are out of scope one-offs: Ancient Mew
  (no number at all), Set 1 Unlimited 68, XY Black Star Promos 223.

## Confirmation

`npm run check` passes, with `lib/core/ptcg.test.ts` new: the gallery subset is preferred
for a `TG`/`GG` number, a number holding a different card is refused before any image
request is made, a card-type suffix is looked past (`Mawile` against `Mawile V`), a missing
name or an unreachable card list refuses, and a set with no gallery falls back to the
parent unchecked.

Verified live against both catalogues while deciding: the gallery-by-prefix lookup resolves
correctly for Silver Tempest, Lost Origin, Brilliant Stars, Crown Zenith and Astral
Radiance; all 23 image URLs return 200 under their real numbers; and TCGdex and
pokemontcg.io agree with each other and disagree with the collection on all 23.

Not exercised against a live `npm run dev` with real Notion/Supabase data — those
credentials are not available in this workspace, the same limitation ADR-0014 recorded.

## Related

- `docs/decisions/0021-latest-pull-owned-only.md` — what prompted the audit
- `docs/trainer-gallery-row-corrections.md` — the 23 rows, row by row, with the number or
  name each should carry. A worklist, to be deleted once they are corrected.
- Code: `lib/core/ptcg.ts` (`ptcgScan`, `findGallery`, `namesIn`, `isGalleryNumber`),
  `lib/core/cards.ts` (the fallback gate), `lib/core/catalogue.ts` (the `code` comment)
