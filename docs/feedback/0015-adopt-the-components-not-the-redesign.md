---
id: FB-0015
date: 2026-08-19
source: Bart
source-type: stakeholder
severity: 3
sentiment: neutral
status: addressed
tags: [ui, design-system, untitled-ui, scope]
---

# Adopt as much of Untitled UI as possible, without the interface actually looking different

## What was said

> zoveel mogelijk onderdeel van untitled maken maar visueel niet echt veranderen
> snap je?

English translation: *"make as much of it part of Untitled as possible, but
don't really change it visually, you get me?"*

## Context

Said immediately after being told that `/collection` had been broken and
reverted. The report it answers said, in substance: replacing the rail means
taking Untitled UI's responsive model instead of this app's, and that drags
`CardsView.tsx` (1,659 lines) and `cards.css` (1,169 lines) with it, because the
three are joined through the stylesheet. Roughly as much work again as the whole
PR so far.

So it arrives as a reaction to a cost, not as a fresh idea.

## Interpretation

*Hypothesis, not fact.*

The reading that fits the moment: **take Untitled UI's components, do not take
its redesign.** Swap what a control is *made of* — the button, the input, the
card surface, the nav item — and leave what the screen *is*: the same layout,
the same breakpoints, the same rail-becomes-a-screen behaviour on a phone.

That is a narrower instruction than FB-0014 ("helemaal untitled … mag je
weggooien"), and it is narrower in exactly the place that just went wrong. It
also makes the remaining work tractable: converting `CardsView`'s controls one at
a time is a sweep with a screenshot after each, where redesigning the shell is a
rewrite that cannot be checked until it is finished.

**Asked rather than guessed, and the answer narrowed it further.** Whether the
shipped visual changes stood or were to be reverted:

> Mwah het ging me eigenlijk om de tabbar tbh, maar zoveel mogelijk untitled
> alleen het gedrag naar tabbar vind ik belangrijk zegmaar

*"Meh, it was really about the tab bar tbh — but as much Untitled as possible,
only the behaviour of the tab bar is what I care about."*

And on how far to go inside `/collection`: *"zo goed mogelijk denk ik of?"* — as
well as possible.

So the instruction was never about the palette or the card surfaces; those
stand. It is about **one thing that was deleted**: the bottom tab bar. The
attempt that got reverted removed `AppTabBar` on the grounds that Untitled UI
answers small screens with a slide-over on the sidebar, and two navigations for
one app is one too many. That reasoning is sound in general and wrong here —
the tab bar is the behaviour that matters on a phone, and it is not up for
replacement.

## Action

- [x] Ask whether the shipped visual changes stand or are reverted. They stand.
- [x] Establish that the tab bar's behaviour is not up for replacement, whatever
      Untitled UI's own answer to small screens is.
- [ ] Convert the tab bar's *material* to Untitled UI and leave its behaviour
      alone: it stays a bottom bar, at the same widths, with the same slots.
- [ ] Inside `/collection`, convert controls in place and move cards.css toward
      Tailwind "as well as possible" — without touching the responsive model.

## Related

- Feedback: FB-0014 — "helemaal untitled", which this narrows.
- Decision: ADR-0061 — the two-item identity list and the palette swap.
- Decision: ADR-0063 (attempted) — the shell rebuild this reverses. It was
  reverted before it was recorded, so there is nothing to supersede.
- ADR-0012, ADR-0017 — why the rail's responsive model is in CSS and what
  happens when a utility overrides it.
