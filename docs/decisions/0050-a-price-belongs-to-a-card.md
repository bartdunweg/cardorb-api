---
id: ADR-0050
title: Price history is stored per card, not per collection
status: accepted
date: 2026-08-16
scope: repo
deciders: [Bart]
superseded-by: null
tags: [pricing, schema, dashboard, cron]
---

# Price history is stored per card, not per collection

## Context and problem statement

The value chart says the collection is up. It cannot say what did it — whether
two hundred euros is one Charizard, or four hundred up and two hundred down with
the total hiding both. That needs a price per card over time, which nothing
stored.

It was the one suggestion left unbuilt from the batch on 16 August, held back
because it is the only one with a table that never stops growing, and recurring
cost is a standing constraint on this project.

## Considered options

1. **A row per card per reading, with no owner.**
2. **A row per *held* card per user per reading**, mirroring
   `collection_value_snapshots`, which is the shape already in the repo.
3. **Derive movers from the value snapshots**, storing nothing new.

## Decision

(1). `card_prices (tcg_id, snapshot_date, market_cents, holo_cents)`, primary key
on the first two, no `user_id` anywhere.

**Because a price is a fact about a card, not about a person.** Two people
holding the same Charizard hold the same price. This is the line
`lib/core/catalogue.ts` and `lib/core/collection.ts` already draw between them —
card facts cached globally under a key with nobody's name in it, rows cached per
user — and this is simply the first *stored* thing on the catalogue side.

The size argument falls out of that rather than driving it. Option (2) would
write ~1,900 rows a week for this collection and add a full set again per
account; (1) writes ~1,600 a week for everybody, about 83,000 rows and 5 MB a
year however many people sign up. That is what made the cost objection go away
rather than be accepted.

(3) was rejected because a value snapshot is a single total. There is nothing in
it to attribute, which is precisely the gap being filled.

**Read by signed-in callers only**, a deliberate middle. The prices are public —
Cardmarket publishes them daily and anyone may download the guide. What is not
worth publishing is *the set of tcg_ids in the table*, which is the union of
every collection this deployment tracks and would say which cards exist
somewhere without saying whose. Requiring a session costs nothing real. There is
no insert or update policy at all, so only the service role writes, which is the
weekly cron.

Three smaller calls, recorded because they will read as arbitrary later:

- **`market`, not the Near Mint estimate.** Movement is a comparison between two
  of Cardmarket's own figures. The NM band multiplies both sides by the same
  constant and only removes the ability to check the arithmetic against source.
- **Each card against its own earliest reading**, not a fixed thirty days. The
  series is weekly and young, and a card added last month has less history than
  one that was here when the table was made. The dates travel with each mover so
  the page says what it compared.
- **Ranked by effect on the total**, not by percentage. A common that doubles
  from four cents is the bigger number and the smaller event.

## Consequences

- Good, because the dashboard can finally attribute a move, and the same data
  answers "what is this card doing" later without another table.
- Good, because the table grows with the catalogue rather than with the user
  count, so a second account costs nothing.
- Good, because the cron already downloads the whole guide for the value
  snapshot; this is the same 14 MB read, used twice.
- Bad, because **a card nobody holds is never priced**. This snapshots held
  cards only, so a wishlist card has no history and the movers list cannot cover
  one. Pricing the whole catalogue weekly would be ~100,000 rows a week to
  answer questions about 1,600 cards.
- Bad, because **the first movers list is a month away**. Two readings are
  needed and they arrive weekly; until then the card renders nothing, the same
  rule the value chart follows.
- Neutral, because a correction to a card's `finish` or number moves its price
  in the history without the market moving — the reading is of whichever
  printing the row claimed that week. Visible as a one-off step, and the cause
  is recorded in the collection's own history rather than here.

## Confirmation

- `lib/core/movers.test.ts` covers the arithmetic: earliest against latest per
  card, weighting by copies held, the foil reading for a reverse holo, ranking
  by effect on the total rather than percentage, a single reading excluded
  rather than counted as unchanged, wishlist cards excluded, and movement below
  ten cents dropped as noise.
- Verified against production after the first run: 1,564 rows written, and an
  anonymous PostgREST client reads **0** of them and is refused **401** on
  insert.

## Related

- Builds on: ADR-0046 (the cron this rides along with), ADR-0044 (per-user value
  history, and the total this attributes), ADR-0048/0049 (the finish, which
  decides which of the two stored prices a copy takes)
- Code: `supabase/migrations/20260816220000_card_price_history.sql`,
  `lib/core/movers.ts`, `lib/core/snapshot.ts` (`cardPricesOf`),
  `lib/storage/postgres.ts`, `lib/core/collection.ts` (`getCardPrices`),
  `app/components/CardsDashboard.tsx`
