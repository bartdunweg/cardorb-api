---
id: FB-0012
date: 2026-08-17
source: Bart
source-type: stakeholder
severity: 1
sentiment: neutral
status: addressed
tags: [landing, navbar, ui]
---

# The signed-in viewer in the landing page navbar should be a pill button showing avatar and username, not the sentence "Signed in as {name}"

## What was said

> Kan je signed in as mag gewoon een (Avatar) {Username} zijn in een pill button met
> lichtgrijze rand denk ilk

> Op landignpage als je ingelogd bent dus

English translation:

> Can you make "signed in as" just an (Avatar) {Username} in a pill button with a light
> grey border, I think.

> On the landing page when you are signed in, that is.

## Context

The public landing page `/` (and, unmentioned but identical, `/app/ios`). When a visitor
is signed in, the navbar's right slot renders a bare link: a 24px avatar followed by the
words "Signed in as {name}" (`app/page.tsx:222-250`, duplicated at
`app/app/ios/page.tsx:192-218`). Signed out, the same slot holds a text link and a real
button (`Sign up`).

## Interpretation

The slot reads as a sentence rather than as a control, so it does not look clickable and
does not match the signed-out state it replaces. Making it a bordered pill gives it the
affordance of the button beside it, and dropping "Signed in as" from the visible text
removes words the avatar already says. The meaning has to survive for screen readers, so
it moves into the accessible name rather than disappearing.

Cosmetic rather than functional — the link works and goes to the dashboard either way —
hence severity 1.

## Action

- [x] Extract the duplicated block into `app/components/ViewerPill.tsx` and render it as
      a rounded-full link with a `--color-border` edge, avatar plus username only, with
      "Signed in as …" carried by `aria-label`. Both marketing pages use it.
- [x] Found on the way: a display name is allowed 60 characters and the navbar's right
      column would not shrink below it, so a long name pushed the pill off the side of a
      phone. The column is `minmax(0,1fr)` now and the name ellipsizes inside the pill.

## Related

- Decision: ADR-0042 (`0042-ios-app-page.md`) — why the two marketing pages share parts
  instead of copying them.
- Changelog: `docs/changelog.d/2026-08-17-signed-in-pill-in-the-navbar.md`
