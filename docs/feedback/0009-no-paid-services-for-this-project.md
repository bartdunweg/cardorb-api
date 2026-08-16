---
id: FB-0009
date: 2026-08-16
source: Bart
source-type: stakeholder
severity: 2
sentiment: neutral
status: addressed
tags: [constraints, cost, pokemontcg, catalogue, dependencies]
---

# No paid services: the pokemontcg.io API key is parked, deliberately

## What was said

> "Ik wil wegblijven van betalingen, dus daarom stel ik die API-key er even uit,
> als dat kan"

English: "I want to stay away from payments, so I'm holding off on that API key
for now, if that's possible."

## Context

Said immediately after ADR-0037/0038 shipped and merged (PR #56), in response to
a recommendation — repeated in both ADRs and in the PR description — that
`POKEMONTCG_API_KEY` should now be set, because browse made pokemontcg.io
load-bearing for a second feature and the unauthenticated tier measured 5
failures in 10 rapid requests.

This is the second time paying for that dependency has come up. ADR-0033 already
records "a paid key/its successor 'Scrydex' was already declined as
disproportionate for a single-user hobby app". So this is not a one-off answer to
one recommendation; it is a standing constraint on the project, and it is being
written down as one rather than re-litigated every time a catalogue is chosen.

## Interpretation

**Cost is a hard constraint, not a preference to be weighed.** Card Orb is one
person's hobby collection. A dependency that requires a card on file is
disqualified, and "it's only a few euros a month" is not an argument that applies
here. Free tiers are fine; free tiers that are announced as ending are a risk to
be tracked, not a reason to pay early.

Nothing had to change to honour this — the key was never set, so parking it is
the status quo. What it does change is the standing advice: the recommendation to
set a key is withdrawn, and the reliability question it was answering has to be
solved another way or accepted.

Two facts found while checking this, which matter more than the key itself and
are recorded here because they were not known when ADR-0037 chose its catalogue:

1. **pokemontcg.io's free V2 tier is publicly announced as going away**, in
   favour of Scrydex, which is metered and paid (credits per request, a fixed
   monthly allotment). **No shutdown date is published.** The free V2 API is
   still up and still answering unauthenticated — verified live today.
2. It is therefore **not confirmed that a pokemontcg.io key is still free to
   obtain at all.** dev.pokemontcg.io refuses automated fetches, so this could
   not be checked from here. Which makes holding off the better-informed call
   rather than merely the cautious one.

## Action

- [x] `POKEMONTCG_API_KEY` stays unset. The recommendation to set it is
      withdrawn from the standing advice in `STATE.md`.
- [x] Recorded the sunset risk and the escape route, so the next session does not
      deepen the pokemontcg.io dependency without seeing the constraint. See
      ADR-0039.
- [ ] Not done, deliberately: no migration off pokemontcg.io today. It works, it
      is free today, and moving costs the rarity line on browse tiles (TCGdex's
      set-detail endpoint carries no rarity per card — ADR-0030). The trigger to
      act is a published date or a failure rate that hurts, not this record.

## Related

- Constrains: ADR-0037 (browse is built on pokemontcg.io), ADR-0038 (its scans
  already come from TCGdex, which is the half that is not at risk)
- Precedent: ADR-0033, which declined the same spend once already
- Decision: ADR-0039
