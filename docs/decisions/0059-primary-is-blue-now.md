---
id: ADR-0059
title: Every primary surface went from near-black to blue, in one token
status: accepted
date: 2026-08-19
scope: repo
deciders: [Bart]
superseded-by: null
tags: [ui, design-system, untitled-ui, tokens, colour]
---

# Every primary surface went from near-black to blue, in one token

The most visible change of the whole Untitled UI conversion, and the one worth
reading before anything else in this batch.

## What changed

```css
/* was */
--btn-primary-bg:   light-dark(#111111, #ffffff);
--btn-primary-text: light-dark(#ffffff, #101010);

/* now */
--btn-primary-bg:   var(--color-bg-brand-solid);   /* → #0066cc */
--btn-primary-text: #ffffff;
```

Fourteen places read those two tokens, and they all moved together: the primary
buttons, the tab bar's active pill and its add button, a selected filter chip,
the Pokédex badge, the track row's active state. Card Orb's primary action was
near-black in light and white in dark. It is blue in both now.

## Why

ADR-0055 settles it: Untitled UI's value is the default, and Card Orb's needs
either to be the identity or to be argued from a measurement. "What colour is a
primary button" is exactly the kind of question a design system exists to answer,
and Untitled UI answers it with the brand colour. Nothing in this repository
argued for the near-black beyond it being what was there.

One edit rather than fourteen, deliberately: the primary button and the active
pill cannot now disagree, which is the property the two tokens were created for
in the first place.

**Not `--color-tint`.** `--color-bg-brand-solid` resolves to `--color-brand-600`,
which ADR-0057 set to the darkened blue precisely because a filled accent with a
white label needs 4.5:1 and the lighter one measures 4.02. Every surface reading
these two tokens carries text on it.

## Consequences

- **The landing page's call to action is blue.** So is `Sign up` in the nav, so
  is the tab bar's add button. Anyone who knew this product by its black buttons
  will notice immediately. That is the change, not a side effect of it.
- The identity that ADR-0055 protects — the glass material, the orb, the
  holographic cards — is untouched. What moved is the accent's reach: it used to
  be the thing you *chose*, and is now also the thing you *do*.
- `tabbarClasses.ts` had a comment reading "the same black every other primary
  action uses". Its claim — that this matches every other primary action — is
  still true; the colour it names is not. Corrected in place rather than left to
  mislead.
- Reversing this is one line in `app/styles/tokens.css`. It is deliberately a
  token and not fourteen class edits, so that stays true.

## Alternatives considered

- **Keep the near-black for primary and use blue only where Untitled UI's own
  components render it.** Rejected: that is exactly the half-converted state
  that makes a design system worse than either option — two primaries, told
  apart by which component happened to draw them.
- **Point the tokens at `--color-tint` (`#007aff`).** Rejected on contrast:
  4.02:1 under a white label, which is the failure ADR-0057 had just fixed.

## Confirmation

`./scripts/verify.sh` exits 0 — 488 tests in 42 files. The chain resolves in the
built CSS, checked rather than assumed:

```
--btn-primary-bg: var(--color-bg-brand-solid)
--color-bg-brand-solid: var(--color-brand-600)
--color-brand-600: #0066cc
```

Eighteen screenshots across six public pages at three widths all pass — the
surfaces reading these tokens are on signed-in screens, which is also the gap:
**the tab bar, the chips and the Pokédex badge have not been photographed.**
`owner.spec.ts` is what closes it, and it needs `VISUAL_EMAIL` set.

## Related

- ADR-0055 — Untitled UI is the default.
- ADR-0057 — why this is `brand-600` and not `tint`.
