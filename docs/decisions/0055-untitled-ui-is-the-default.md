---
id: ADR-0055
title: Untitled UI is the default; Card Orb's value has to earn the exception
status: accepted
date: 2026-08-19
scope: repo
deciders: [Bart]
superseded-by: null
supersedes: ADR-0054 (decision 2 only)
tags: [ui, design-system, untitled-ui, tailwind, tokens]
---

# Untitled UI is the default; Card Orb's value has to earn the exception

Supersedes **decision 2 of ADR-0054** and nothing else. Decisions 1 and 3 of that
record — components vendored at the repository root, primitives emitted from
`lib/design/tokens.ts` — stand unchanged.

## Context and problem statement

ADR-0054 recorded the direction as "keep the Card Orb look, styled with the
existing tokens". Applied literally that means every disagreement between the two
systems is settled in favour of what Card Orb does today: every radius, shadow,
focus ring, spacing step and transition. That is close to re-implementing
Untitled UI's markup against Card Orb's stylesheet — it buys the accessibility
and the component coverage and throws away the design work, which is most of what
the library is for.

Corrected directly (FB-0013):

> bij twijfel volg untitled please

## Decision

**Untitled UI's value is the default. Card Orb's value is kept only where it
earns the exception, and there are exactly two ways to earn it:**

1. **It is the identity.** The glass material, the orb, the holographic cards,
   and the tint blue. These are what make the product look like itself, and the
   previous answer — "glas, orb, holo blijven" — asked for them explicitly.
2. **It is argued from a measurement.** `lib/design/tokens.ts` justifies several
   colours by a contrast ratio it can cite: `labelTertiary` is `#737373` because
   `#767676` measured 4.47 and 4.35 on the glass and the page, both under AA;
   `tintLabel` exists because the fill blue is 4.02:1 as text. Those values were
   found by failing, and Untitled UI's palette has not been measured against
   *this* app's glass surface.

Everything else takes Untitled UI's value: radii, shadows, focus rings, spacing,
type scale, transition timing, disabled treatments, the neutral ramp.

**Where a case is still even after both rules, take Untitled UI's and note it.**
Do not ask. That is the whole content of "bij twijfel".

## Consequences

- The list of primitives that get Card Orb values shrinks from "roughly forty" to
  the identity colours and the measured ones. Most of Untitled UI's neutral ramp
  arrives untouched.
- **The app will visibly change.** ADR-0054 assumed a conversion could be proven
  by a screenshot diff near zero. That is no longer the target: buttons will take
  Untitled UI's `rounded-lg` rather than the 999px pill, its `shadow-xs-skeuomorphic`
  rather than the glass shadow, its focus ring rather than the current one. The
  screenshot harness stops being a pass/fail gate for this work and becomes what
  it was built to be — a way to see what moved and check each difference is one
  that was chosen.
- `radius.btn: 999px` in `lib/design/tokens.ts` has thirty-odd CSS rules reading
  it and is not the identity by this rule's reckoning. It is the clearest early
  test of whether the rule is really wanted; the pill is distinctive but nothing
  records a reason for it beyond taste.
- The contrast values survive, which matters: this app has shipped contrast bugs
  before (`gen-tokens.mjs`'s header records OG images using the exact value
  `tokens.css` rejects), and adopting an unmeasured palette wholesale is how that
  happens again. Every Untitled UI colour that lands on a glass surface still has
  to be measured there.

## Alternatives considered

- **Keep ADR-0054's reading — Card Orb's value wins by default.** Rejected on
  direct correction. It also produces the worst outcome of the three: the cost of
  adopting a component library with none of its design benefit.
- **Take Untitled UI wholesale, including the identity.** This is the option
  already declined when the direction was chosen ("Volledig Untitled UI: de
  neutrale SaaS-look, glas en holo gaan eruit"). FB-0013's "bij twijfel" is a
  tie-break for unclear cases, not an instruction to drop what was explicitly
  kept.

## Confirmation

Not yet confirmed. Nothing is converted. The proof is still `/login`, and it is
now a *review* of the differences rather than a check that there are none.

## Related

- ADR-0054 — the groundwork; decision 2 superseded here.
- FB-0013 — the correction, quoted verbatim.
- ADR-0012, ADR-0017, ADR-0018, ADR-0020 — four ways this migration has broken
  before, all invisible to tests, typecheck and lint.
