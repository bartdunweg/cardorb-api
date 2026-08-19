---
id: FB-0013
date: 2026-08-19
source: Bart
source-type: stakeholder
severity: 3
sentiment: neutral
status: open
tags: [ui, design-system, untitled-ui]
---

# Where Untitled UI and Card Orb's existing look disagree, Untitled UI wins unless there is a reason not to

## What was said

> bij twijfel volg untitled please

English translation: *"when in doubt follow Untitled please"*.

## Context

Said immediately after the Untitled UI groundwork was reported (ADR-0054,
commit `a2b2efd`, branch `bartdunweg/untitled-ui`), and roughly twenty minutes
after answering a direct multiple-choice question about the visual direction
with:

> Behoud de Card Orb-look: Untitled UI-componenten, maar gestyled met jouw
> bestaande tokens (glas, orb, holo blijven)

So this is a refinement of that answer rather than a reversal of it. Nothing had
been converted yet — one vendored component on disk, nothing importing it — so
the correction arrived before any code depended on the looser reading.

## Interpretation

*Hypothesis, not fact.*

"Keep the Card Orb look" was being applied too conservatively. Read on its own it
suggests that every disagreement between the two systems should be resolved in
favour of what Card Orb does today — every radius, every shadow, every focus
ring, every spacing step. That is close to re-implementing Untitled UI's markup
with Card Orb's stylesheet, which buys the accessibility and the component
coverage but throws away the design work that is most of what the library is
for.

The tie-break being asked for is the other way round: **Untitled UI is the
default, and Card Orb's version has to earn the exception.** What earns it is
presumably the identity — the glass material, the orb, the holographic cards,
the accent blue — and the values this repository has already argued from
measurements it can cite: the contrast ratios in `lib/design/tokens.ts`, where
several colours exist specifically because the obvious value failed AA on the
glass surface.

The words "bij twijfel" are doing real work here. This is a rule for the
genuinely unclear cases, not an instruction to discard the identity that the
previous answer explicitly asked to keep. Where the two conflict *clearly* —
holo cards, the orb, the glass — the previous answer still stands.

## Action

- [ ] Treat Untitled UI's own value as the default for anything with no recorded
      reason behind it in this repository: radii, shadows, focus rings, spacing,
      transition timings, disabled treatments, type scale.
- [ ] Keep Card Orb's value only where it is the identity (glass, orb, holo,
      the tint blue) or where `lib/design/tokens.ts` argues it from a measured
      contrast ratio. Both categories are narrow and both are already written
      down.
- [ ] Revisit ADR-0054's decision 2 in that light. Re-pointing the primitive
      palette stands, but the list of *which* primitives get Card Orb values
      should be shorter than "all forty".
- [ ] Where a specific case is still 50/50 after the two rules above, go with
      Untitled UI and note it — do not ask.
- [ ] Write the decision record that supersedes the affected part of ADR-0054
      before converting `/login`, since this changes what the proof screen is
      proving.

## Related

- Decision: ADR-0054 (`docs/decisions/0054-untitled-ui-groundwork.md`) — the
  groundwork this refines. Its decision 2 is the part affected.
- Feedback: FB-0009 (`0009-no-paid-services-for-this-project.md`) — unrelated in
  substance, but the same shape: a standing rule given once, meant to apply to
  every later judgement call without being restated.
