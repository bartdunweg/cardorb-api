---
id: ADR-0021
title: The latest pull is an owned card, and the public API keeps having no key
status: accepted
date: 2026-08-15
scope: repo
deciders: [Bart]
superseded-by: null
tags: [api, public, auth]
---

# The latest pull is an owned card, and the public API keeps having no key

## Context and problem statement

The portfolio site needed to show the most recent pull, and the request was framed as
"a public API key so my website can fetch it". Two things were wrong with the situation
as found.

First, the premise: `/api/v1/public/[username]/latest-pull` already existed (ADR-0014),
already had no key, and already sent `Access-Control-Allow-Origin: *`. Nothing was
blocking the portfolio.

Second, the answer it gave was wrong. Production returned:

```json
{"latestPull":{"name":"Umbreon","number":"110","image":null,"tcgId":null,
 "setName":"MEP Black Star Promos","acquiredAt":"2026-07-25T09:06:00+00:00"}}
```

That row has `owned: false` — a wishlist card, not a pull. `latestPull()` gated on
`excluded` and `acquiredAt` but never on `variant.owned`, even though `Variant.owned` is
exactly the binder/wishlist flag and had been there since ADR-0008. The two defects
compounded: a wishlist row is typically a just-announced promo, and MEP-110 exists in no
catalogue at all (TCGdex's `mep` stops at 080, Limitless has published `MEP_001`–`MEP_088`,
pokemontcg.io has no MEP set), so the card arrived with `image: null` as well. The
portfolio would have shown a blank frame for a card that was never bought.

## Considered options

1. **Issue a public API key.** Rejected. A key that ships inside a public website's
   JavaScript is readable by anyone who opens devtools, so it is not an access control —
   it is an env var to keep in sync across two repos in exchange for nothing. This route
   has no auth, no cookies and no price data to protect, which is the same reasoning
   ADR-0014 used to reject an `ALLOWED_ORIGINS` allowlist here.
2. **Have the portfolio filter client-side.** Rejected: it cannot. The public shape
   deliberately carries no `owned` field, and widening it to expose one would be leaking
   a private fact (what Bart wants but does not have) to answer a question the server
   already knows the answer to.
3. **Add `owned` to the gate in `latestPull()`.** Chosen.
4. **Also skip a card with no artwork, so the widget always has a picture.** Rejected:
   truthful over convenient. The endpoint should say what the newest card is, not the
   newest card that photographs well, and `image: null` is documented for the consumer to
   branch on. ADR-0022 closes the artwork gap where it is actually closable.

## Decision

`latestPull()` (`lib/core/cards.ts`) skips any variant that is not `owned`, alongside the
existing `excluded` and `acquiredAt` gates. No API key is added, now or as a follow-up.

Two smaller things went in with it, both for a route that never passes through
`authorise()` and therefore had no throttle at all: a 60/minute per-address rate limit
reusing `createRateLimiter` (`lib/api/rate-limit.ts`), and an `OPTIONS` handler. The GET
is a simple request and never preflights today, but the first header the portfolio adds
would otherwise fail with nothing on the wire to explain it.

## Consequences

- Good, because the endpoint now answers the question its name asks. The wishlist and the
  binder are different things and only one of them is a pull.
- Good, because it incidentally fixes the artwork symptom for this class of card: a
  just-announced promo no catalogue has a scan for is almost always a wishlist row.
- Good, because `README.md` now documents the route, the nullable fields and the relative
  `/api/cover` image path, which is the part a consumer gets wrong first.
- Neutral, because the rate limit is per serverless instance and best-effort, as
  `lib/api/rate-limit.ts` says of itself. It blunts a flood; it is not a quota.
- ADR-0014 is not rewritten. This extends it.

## Confirmation

`npm run check` passes. New coverage in `lib/core/cards-latest-pull.test.ts` (a
wishlist-only collection, a newer wishlist card losing to an older owned one, and a card
owned in one rarity and wanted in another) and in the route test (the wishlist card is
skipped, the 429 still carries the CORS header, `OPTIONS` answers 204). The production
response was the regression case and was captured before the change, above.

## Related

- Extends: `docs/decisions/0014-public-latest-pull-endpoint.md`
- `docs/decisions/0022-gallery-artwork-via-pokemontcg.md` — the rest of the artwork gap
- Code: `lib/core/cards.ts` (`latestPull`),
  `app/api/v1/public/[username]/latest-pull/route.ts`, `README.md`
