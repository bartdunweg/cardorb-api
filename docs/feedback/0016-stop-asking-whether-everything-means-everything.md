---
id: FB-0016
date: 2026-08-19
source: Bart
source-type: stakeholder
severity: 2
sentiment: negative
status: addressed
tags: [process, untitled-ui, scope]
---

# "In principe alles untitled" was already the answer; stop re-asking it per layer

## What was said

> Kunnen we dat ook niet "untitled" maken?
>
> Ik zei dat ik in principe alles "untitled" wil

English translation: *"Can't we make that 'Untitled' too? I said I want
basically everything 'Untitled'."*

## Context

Said after a report that broke the tab bar into "what is Untitled UI now" and
"what is still Card Orb", listed the thirteen remaining variables, split them
into convertible and not, and then asked whether to convert them — closing with
an assumption that this was the user's call rather than mine.

It is the second time in the same session. The first was the mobile navigation
model, where asking was right: it traded a real behaviour away. This was not
that. Converting `--space-4` to `p-4` and `--shadow-elevated` to `shadow-lg`
changes nothing anybody can see, and the screenshot harness proves it in one
run.

## Interpretation

*Hypothesis, not fact.*

The standing instruction — FB-0014's "helemaal untitled", FB-0015's "zoveel
mogelijk untitled" — is a general rule, not a per-file permission that expires.
Re-asking it for each layer treats a decision already made as if it were still
open, which is slower for the user and reads as not having listened.

The distinction that was missed: **a question is worth asking when the answer
trades something away.** The mobile model traded the tab bar, so it was worth
asking. Spacing tokens trade nothing — the values are identical, the harness
checks it, and the only cost is my time. That is not a fork; it is work.

FB-0015 also sits behind this. "Visueel niet echt veranderen" was read as a
brake, and the follow-up established it was about the tab bar specifically. Even
after that was cleared up, the habit of asking survived it.

## Action

- [x] Convert the tab bar's remaining tokens: spacing, shadow, timings. Prove
      nothing moved rather than assert it — the nine screenshots that changed
      last time must stand still.
- [x] Keep only what genuinely has no Untitled UI counterpart, and say which
      those are in the code rather than in a question: `--control-h`, the
      z-index layers, the scrim blur, and the behaviour class names that
      `cards.css` and `useSlidingPill.ts` select on.
- [x] Apply the same rule to the rest of the sweep: convert unless the answer
      costs something, and only then ask.

## Related

- Feedback: FB-0014, FB-0015 — the instruction this restates for the third time.
- Decision: ADR-0061 — the identity list, which is what "unless it costs
  something" actually means here.
