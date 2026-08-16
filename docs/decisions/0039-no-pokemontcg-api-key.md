---
id: ADR-0039
title: No pokemontcg.io API key — the cost is a hard constraint, and browse barely pays for it anyway
status: accepted
date: 2026-08-16
scope: repo
deciders: [Bart]
superseded-by: null
tags: [constraints, cost, pokemontcg, catalogue, reliability, dependencies]
---

# No pokemontcg.io API key — the cost is a hard constraint, and browse barely pays for it anyway

## Context and problem statement

ADR-0037 and ADR-0038 both closed by recommending `POKEMONTCG_API_KEY` be set,
on the grounds that browse made pokemontcg.io load-bearing for a second feature
and the unauthenticated tier had measured 5 failures in 10 rapid requests
(ADR-0033, May 2026). Bart declined: *"Ik wil wegblijven van betalingen, dus
daarom stel ik die API-key er even uit"* (FB-0009). The same spend was declined
once before, in ADR-0033.

So the constraint is settled. What was not settled — and what this record exists
for — is whether the recommendation was even right, because it was made without
measuring the traffic shape it applied to. Measured today, unauthenticated:

| request shape | result |
|---|---|
| 12 rapid, search-shaped (`q=name:*char*`, pageSize 20) | **9 failed** (500/502) |
| 6 whole-set, browse-shaped (`set.id:…`, pageSize 250, 1s apart) | **1 failed** |

**The recommendation was calibrated to the wrong endpoint.** Those two numbers
describe different features:

- **Browse** asks once per set, at most a handful of times a day, behind
  `revalidate: DAY` — a warm set costs zero requests. At a ~17% per-attempt
  failure rate and three attempts, the chance a set actually fails to load is
  under 1%, and the failure is a 502 with a retry button rather than a wrong
  answer (ADR-0033, ADR-0037).
- **Search** asks per keystroke, behind a 300 ms debounce and a 300 s cache. At
  a ~75% burst failure rate, three retries still leaves a real chance of "Search
  is temporarily unavailable" on a query someone actually typed.

Two further facts, found while checking whether the key was even obtainable:

1. pokemontcg.io's free V2 tier is publicly announced as **going away**, in
   favour of Scrydex, which is metered and paid. **No shutdown date is
   published**, and free V2 is still up and answering unauthenticated today.
2. It is **not confirmed a pokemontcg.io key is still free to obtain** —
   dev.pokemontcg.io refuses automated fetches, so this could not be verified.
   The recommendation to "just get a key" may have been recommending a purchase.

## Considered options

1. **Set the key.** Rejected — cost is a hard constraint here (FB-0009), and it
   is not established that the key is free rather than a Scrydex subscription.
2. **Migrate browse off pokemontcg.io to TCGdex now.** Rejected as premature.
   TCGdex is free, unmetered, and already supplies browse's *scans* with 100%
   card-level coverage on every set tested (ADR-0038) — so the escape route is
   real and short. But its set-detail endpoint carries no rarity per card
   (ADR-0030), so moving costs the rarity line on every browse tile, today, to
   pre-empt a sunset with no announced date.
3. **Harden the unauthenticated path: longer debounce, longer caches, more
   retries.** Rejected for now as fiddling with numbers rather than fixing
   anything — and more retries against a host that is rate-limiting bursts makes
   the burst worse, not better.
4. **Park the key, accept the measured risk, write down the trigger and the
   escape route** — chosen.

## Decision

`POKEMONTCG_API_KEY` stays unset, and the standing recommendation to set it is
**withdrawn** from `STATE.md`, ADR-0037's and ADR-0038's consequence lists being
immutable and therefore left as they stand — this record is what supersedes their
advice.

Browse is accepted as-is: the measurement says its exposure is under 1% per cold
set, and it degrades to a retryable 502 rather than to a wrong answer.

Search's exposure is acknowledged as real and **not** addressed here. It is a
pre-existing condition of a shipped feature (ADR-0033 built the "Search is
temporarily unavailable" state precisely for it), it has got worse rather than
appeared, and nothing in this session caused it.

**The trigger to act is a published Scrydex date, or Bart reporting search
failures often enough to be annoying — not this record.** When it fires, the
escape route is option 2: TCGdex for the set list and set contents, losing the
rarity line, with `withTcgdexScans()`'s proven name→set mapping already doing the
hard half of the join.

## Consequences

- Good, because the constraint is now written down as a constraint rather than
  re-argued every time a catalogue is chosen. Third time it came up (ADR-0033,
  ADR-0037/0038, here); there should not be a fourth.
- Good, because the advice given twice in the last hour is corrected with a
  measurement instead of being quietly dropped. Browse does not need a key.
- Bad, because the add-card search stays flaky on bursts, with no fix and no
  planned one. Mitigated only by the fact that it already says so out loud.
- Bad, because the project now knowingly depends on a free tier its owner has
  announced the end of. Tracked rather than solved, deliberately.
- Neutral, and an unplanned bonus: browse is itself a partial answer to search
  being down. A card that cannot be found by typing can now be found by opening
  its set — a different endpoint, far better cached — and added from there via
  the prefill flow (ADR-0037). The two failure modes are no longer the same
  failure.
- Neutral: images are unaffected either way. Card scans come from TCGdex
  (ADR-0038) and set logos are served from pokemontcg.io's CDN, not its API.

## Confirmation

Failure rates measured directly against the live unauthenticated API today, both
shapes, numbers above. Sunset status confirmed as announced-without-a-date from
public sources; dev.pokemontcg.io could not be reached to confirm key pricing,
and that uncertainty is stated rather than resolved.

No code changed. `STATE.md` updated to withdraw the recommendation.

## Related

- Feedback: FB-0009 (the constraint, quoted)
- Constrains: ADR-0037, ADR-0038 (their "set a key" consequences are superseded
  by this record, not rewritten)
- Precedent: ADR-0033 (declined the same spend, and built the failure state that
  makes search's flakiness visible rather than silent)
- Escape route depends on: ADR-0030 (why TCGdex costs the rarity line),
  ADR-0038 (the name→set mapping that would carry the migration)
