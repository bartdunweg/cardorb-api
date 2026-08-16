---
id: ADR-0046
title: The value snapshot runs itself, weekly, for every account
status: accepted
date: 2026-08-16
scope: repo
deciders: [Bart]
superseded-by: null
tags: [value-history, cron, service-role, pricing]
---

# The value snapshot runs itself, weekly, for every account

## Context and problem statement

ADR-0044 gave every account its own value history and left half the feature
unbuilt. `collection_value_snapshots` shipped with three points in it, put there
by hand from a laptop, and nothing added a fourth. A chart whose entire premise
is "recorded over time" would have shown the same three readings for the rest of
its life, and every account created after that day would have shown none at all,
permanently — because the card renders nothing below two points.

The series genuinely cannot be fetched. Cardmarket's API answers with today's
price and no history and is closed to new applications; TCGdex' free
price-history repo is TCGplayer in dollars and stopped in June 2025. So it has
to be recorded, and something has to do the recording on a schedule.

Two constraints shaped the design.

**A cron has no session.** Row level security on that table is
`user_id = auth.uid()`, and at four on a Sunday morning `auth.uid()` is null for
everybody. A job that recorded only the collections whose owners happened to
have a live session would record almost nothing.

**Pricing through the app is the wrong tool for a batch job.** Every screen
reads `card.price`, which `buildCollection()` resolves from TCGdex. With
`CATALOGUE_SET_PRICING_MAX` at 0 — the default — that is one HTTP request per
matched card, so a weekly snapshot of a 1,643 row binder would make roughly
1,600 requests per account to arrive at numbers Cardmarket publishes as a single
14 MB file.

## Considered options

1. **A Vercel cron route using the service role and the Cardmarket price guide.**
2. **Keep it manual** — a documented command somebody runs.
3. **Snapshot opportunistically**, on a dashboard render, when the last point is
   older than a week. No scheduler, no service role.
4. **A GitHub Action** running the existing script on a schedule.

## Decision

We will do (1): `GET /api/v1/cron/snapshot`, `0 4 * * 1`, beside the daily health
ping already in `vercel.json`.

- **Guarded by `CRON_SECRET`, failing closed.** RLS is doing nothing here — the
  service role is past it — so that header is the only thing between this route
  and a stranger writing to everyone's history. A deployment that has not set
  the secret gets a 503, not an unauthenticated write endpoint.
- **`buildCollection(rows, { prices: false })`**, a new option, plus
  `lib/core/cardmarket-ids.generated.json` for the tcgId → idProduct mapping,
  which is the genuinely slow lookup and never moves.
- **`snapshotOf()` in `lib/core/snapshot.ts`**, pure and tested, so this route
  and `scripts/snapshot-collection-value.mjs` cannot drift on what a reading
  means.
- **Per account, committed as it goes**, so a timeout loses the accounts not yet
  reached rather than corrupting the ones already written. One account's failure
  is caught, logged with its id, and reported — the response is a 207 with the
  failures named.

(2) was rejected because it is what we already had, and what we had produced
three points and then stopped. A feature that decays unless somebody remembers a
command is a feature that decays.

(3) is genuinely tempting — no scheduler, no service role, no secret, and the
person is right there to be acted as. It was rejected because it ties a
14 MB download and a full collection build to somebody's page load, and because
it records nothing for an account nobody visits. The chart would be densest for
whoever browses most, which is a property of the reader rather than of the
collection.

(4) was rejected on this repo's own evidence: GitHub Actions is currently
disabled on the account over billing, which is exactly the sort of dependency
that fails quietly for weeks. The scheduler that already runs the health ping is
the one already being paid for and watched.

## Consequences

- Good, because the chart fills in on its own, for every account, including ones
  created after this shipped.
- Good, because `revalidateTag` exists inside a route — the manual script writes
  from plain node and cannot invalidate anything — so a new point is on the
  dashboard immediately rather than up to an hour later.
- Good, because `{ prices: false }` makes the run cheap: one 14 MB download for
  the whole job, and no TCGdex traffic at all.
- Bad, because **`adminClient()` now has a second caller**, and its comment has
  been rewritten from "one caller only" to the rule that was always meant: this
  client may be used only where there is no person for it to act as. A count is
  a thing people increment; a rule can be applied.
- Bad, because **a card added since `cardmarket-ids.generated.json` was last
  written has no product id and counts as unpriced** until somebody runs the
  script, which refreshes that file. Visible in `unpriced` on the page rather
  than silent, which is the only reason it is acceptable — but it does mean the
  manual script still has a job.
- Bad, because the guide's own `createdAt` dates the point, so a week where
  Cardmarket republishes late lands two readings on one date. The upsert makes
  that a correction rather than a duplicate.
- Neutral, because the job is bounded by `maxDuration = 60`. At four accounts it
  is nowhere near that; at a few hundred it would need paging across runs, and
  the "committed as it goes" shape is what makes that a small change later.
- **The two producers agree on the value and disagree on the copy count**, which
  running both against the same day made visible. For 2026-08-16 the cron wrote
  €41,615.97 — the script's figure to the cent, which is the agreement this
  decision is built on. But the cron counted **1,935 copies over 1,610 cards**
  where the script counted **1,921 over 1,597**.

  The difference is where each starts. The script asks the collection API for
  cards and keeps only those with a `tcgId`, then intersects that with the
  rows; a held row that matched no catalogue card is invisible to it. The cron
  starts from the rows and counts every held copy, pricing what it can. So the
  cron's copy count is the more honest one — those fourteen copies are in the
  binder — and the value is identical because all of them are unpriced anyway.

  Left as it is rather than chased. The script's remaining job is backfilling
  from Internet Archive captures, where it is the only tool that works, and its
  three existing points are internally consistent. Worth knowing when reading a
  chart that spans both producers: the line is continuous, the "across N cards"
  caption steps slightly on 2026-08-16.

## Confirmation

- `lib/core/snapshot.test.ts` covers the arithmetic: copies rather than cards,
  the wishlist excluded, an unpriced card counted as held-but-unknown rather
  than free, the guide's date rather than the clock, and — deliberately — that a
  price left on the card is ignored, so the test cannot pass through the path
  this route does not use.
- The route's guard is checked by hand against a local build: no secret → 503,
  wrong secret → 401, right secret → a written point.
- Not confirmed: a real Vercel cron firing. That can only be seen after deploy,
  in the Vercel logs on the first Monday.

## Related

- Builds on: ADR-0044 (per-user value history, and the half this completes)
- Context: ADR-0014 (why collection assembly is cached, and the per-request cost
  that makes `{ prices: false }` matter)
- Code: `app/api/v1/cron/snapshot/route.ts`, `lib/core/snapshot.ts`,
  `lib/storage/postgres.ts` (`listAccountIds`, `writeValueSnapshot`),
  `lib/storage/supabase.ts` (the rewritten `adminClient()` rule),
  `lib/core/cards.ts` (`BuildOptions`), `vercel.json`
