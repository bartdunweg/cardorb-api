---
id: ADR-0045
title: A public collection carries two variant fields, not twelve
status: accepted
date: 2026-08-16
scope: repo
deciders: [Bart]
superseded-by: null
tags: [privacy, public-profile, api, ios]
---

# A public collection carries two variant fields, not twelve

## Context and problem statement

Found while reviewing ADR-0044, in the code next to it rather than in the change
itself.

`stripPrices()` did what its name said: it nulled `card.price` so `/user/<name>`
could show somebody's cards without saying what they were worth. It left
`card.variants` untouched. Variants carry the per-printing inventory fields added
by ADR-0008 — `purchasePrice`, `purchaseDate`, `condition`, `grade`, `notes`,
`quantity`, `isFavorite`, `acquiredAt`, `excluded`, and the row's own `id`.

So a public profile published, for every card in it: what its owner paid, when
they bought it, what condition it is in, how it is graded, whatever private note
they wrote on it, and how many they hold. Two ways at once —
`GET /api/v1/public/:username/collection` returned it as JSON, and
`app/user/[username]/page.tsx` handed the same objects to a client component,
which puts them in the page's own HTML.

The page never showed any of it. Traced through every component the public
variant reaches, exactly two fields are read: `rarity` (the tags under a scan,
the rarity filter, search) and `owned` (a wishlist tag draws as a dashed outline
rather than a fill). The other ten were sent because nothing had ever decided
they should not be.

Worth naming plainly: the function was called `stripPrices` and it stripped
prices. The name described a third of the job and matched the code exactly, which
is why nobody looking at either noticed the other two thirds were missing. ADR-0008
added the fields; this was already true from that day.

## Considered options

1. **Null the money fields only** — `purchasePrice`, `purchaseDate`. The
   narrowest reading of "this is a privacy leak".
2. **A curated public shape, allow-listed to what the public page reads**, the way
   `latestPull()` already curates its own response.
3. **A separate `PublicVariant` type** and a public-only render path, so the
   compiler enforces it rather than a function.

## Decision

We will do (2). `stripPrices()` becomes `forPublic()`, keeps `card.price = null`,
and rebuilds each variant from an explicit allow-list: `rarity` and `owned`
survive, everything else is nulled. `id` goes too — the policies would refuse a
stranger's `PATCH /v1/cards/[id]` anyway, but there is no reason to publish the
list of identifiers to try. `isFavorite` and `excluded` are set `false` rather
than nulled: they are booleans whose neutral value is false, and the distinction
is not worth a nullable type. `Variant.quantity` becomes `number | null`, which is
the one type change this needed.

Renamed rather than extended in place. The gap between the old name and the job
is the mechanism of the bug, and leaving `stripPrices` sitting there doing three
things would leave the trap armed for the next reader.

(1) was rejected because `quantity`, `condition`, `grade` and `notes` are not
money and are still nobody else's business, and because it answers "which of
these fields are sensitive" — a judgement that has to be made again correctly
every time a column is added.

(3) was rejected for cost, not for correctness: it is the better answer, and it
means threading a second card type through `CardsView.tsx`, which is fourteen
hundred lines shared by the owner and public paths. The allow-list plus the test
below buys most of the guarantee for a fraction of the change. Worth revisiting
if the public surface grows.

## Consequences

- Good, because what somebody paid for their cards, in what condition, with what
  notes, and how many they hold, is no longer public — on the API or in the HTML.
- Good, because the assertion is an allow-list, so a new column on `cards`
  becomes a new field on `Variant` and is excluded by default. A deny-list would
  have published it.
- Good, because the name now describes the job, and the OG image route gets the
  same treatment for free.
- Bad, because **this is a breaking change for any out-of-repo consumer of
  `/api/v1/public/:username/collection` that read those fields.** The iOS app's
  source is not in this repo and could not be checked. Nothing on this site read
  them; the risk is real but unmeasured.
- Bad, because `forPublic()` allocates a new object per variant rather than per
  card. On 1,600 cards that is a few thousand short-lived objects per uncached
  public request — measured against the Levenshtein matching in `buildCollection`
  that ADR-0014 exists to cache, it is not the expensive part.
- Neutral, because `Variant.quantity` is now `number | null` everywhere, and
  `copiesHeld()` treats null as zero. It can only be null on a payload that was
  deliberately not told the size of the collection, and `CardsView` computes no
  stats at all when public.

## Confirmation

`lib/core/cards-public.test.ts` asserts, field by field, that a variant carrying
a purchase price, a grade, a condition, a note, a quantity and a row id comes out
the other side with only `rarity` and `owned`; and separately that none of those
values appear anywhere in the serialised payload, whatever shape a future
`Variant` takes. It also asserts `forPublic()` does not mutate what it was
handed — it runs on the output of `getCards()`, which is cached and shared
across requests, so mutating in place would strip the owner's own collection.

Not confirmed against a running site: nobody has loaded `/user/<name>` and read
the RSC payload out of the HTML since the change. Recorded in `STATE.md`.

## Related

- Context: ADR-0008 (per-variant inventory fields — where these fields came
  from), ADR-0044 (the review that found this), ADR-0042
  (`one-privacy-policy-for-app-and-site`, which lists what each third party
  receives; the public profile is not a third party but the same question).
- Code: `lib/core/cards.ts` (`forPublic`), `lib/core/cards-public.test.ts`,
  `app/user/[username]/page.tsx`, `app/user/[username]/opengraph-image.tsx`,
  `app/api/v1/public/[username]/collection/route.ts`
