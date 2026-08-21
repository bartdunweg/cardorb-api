---
id: ADR-0091
title: The (app) loading fallback is the orb, not a skeleton
status: accepted
date: 2026-08-22
scope: repo
deciders: [Bart]
superseded-by: null
tags: [loading, suspense, skeleton, app-shell, motion]
---

# The (app) loading fallback is the orb, not a skeleton

**Written as 0085, renumbered to 0089, and renumbered again to 0091 before
merging** — twice in one session, because `main` moved twice while this was in
review. The rule is ADR-0087's: the half that has not landed is the half that
moves, because the other one's cross-references are already out there. FB-0021
became FB-0024 alongside it, for the same reason.

The renumber is also the cheap half of what that churn cost. See "Confirmation"
for the expensive half: `main` changed the app's canvas colour underneath this
change, and the first version of this record described the wrong one.

## Context and problem statement

`app/(app)/layout.tsx` awaits `getCollection()` before anything paints, so one
Suspense fallback stands in for every signed-in screen: `/dashboard` (stat tiles
and a chart), `/settings` (five stacked sections, no cards), `/collection` (a
toolbar and set panels), and four more.

ADR-0046 answered FB-0010 with a rule — *a shared fallback may only draw what is
identical on every route in the group* — and kept the skeleton form. Six days
later Bart reported the same complaint again (FB-0024): *"dit is helemaal niet de
skeleton van de pagina zelf … hoe het nu werkt, ziet er in ieder geval niet uit."*

The rule was right. Applying it to a skeleton is what was wrong: a skeleton is a
promise about the layout that is coming, and a fallback covering seven unrelated
layouts cannot make that promise. Following the rule honestly produced a grey
rail beside a grey slab — the shape of no page in the app.

## Considered options

1. **Make the skeleton correct** — impossible by construction; "correct" for
   seven different layouts is undefined. Already rejected in ADR-0046.
2. **Per-route `loading.tsx` skeletons** — seven hand-maintained second copies of
   seven layouts. ADR-0018's drift, multiplied. Already rejected in ADR-0046.
3. **Stream the shell** — render the rail, tab bar and avatar for real (they need
   only `viewer`, which `layout.tsx:54` already has before the slow await) and
   suspend only the collection-dependent parts.
4. **One brand loader** — the orb, centred, breathing, on the app background.

## Decision

We will show the orb, centred and breathing, and nothing else. `<Mark />` is
exported from `Wordmark.tsx` with a `px` prop so the fallback reuses the existing
AVIF/PNG pair and the measured nudge rather than hand-writing a second
`<picture>`.

Chosen because it is the only option that stops claiming anything about the page
underneath. It is the app signing its own name while it works, which is true on
all seven routes and stays true when an eighth arrives.

Option 3 is still the better end state and is **deferred, not rejected** — the
same standing it had in ADR-0046, carried forward deliberately. Bart chose the
small change, explicitly "voor nu". The trigger to revisit is unchanged: anyone
touching `AppShell`'s props for another reason.

Two details that are decisions rather than defaults:

- **The orb arrives 150 ms late** (`orbArrive`). A loader that flashes for 80 ms
  is worse than no loader; a fast load now shows plain background and nothing else.
- **`orbBreathe` rests on its 0%/100% frame**, not its 50%. The global
  reduced-motion block caps every animation at one 0.01 ms iteration, so a
  reduced-motion visitor sees the orb frozen on its first frame. Written this way
  that frame is the logo at full size and full opacity. Written as a two-stop
  `from`/`to` it would be a logo stuck at 60%, looking disabled.

## Consequences

- Good, because the class of bug is gone rather than this instance of it: there
  is no second copy of any layout left to drift.
- Good, because `skeletonClassName`, `@keyframes skeleton-sweep` and an already
  dead `.skeleton::after` reduced-motion block go with it — 275 lines deleted
  against 129 added.
- Bad, because the jump from a centred orb to a full interface is a bigger visual
  change than a shell-shaped skeleton would have been. Option 3 is what fixes
  that, and it is not done.
- Bad, because it says less: a skeleton at least implies "a lot is coming".
- Neutral, because the accessibility surface is unchanged — the same single
  `role="status"` saying the bare word "Loading", and the same `sr-only` `h1`, so
  the document is never briefly headingless.

## Confirmation

Measured on 2026-08-22 by rendering the fallback at its real position in the DOM
(a throwaway route inside the root layout's `<main>`, deleted again), at 1440,
900, 640, 639, 375 and 320 px:

- Zero overflow in both axes at every width; the negative `--main-pad-top` margin
  cancels the tab bar's reserved padding exactly, so no scrollbar appears for the
  length of the load and then leaves again.
- Orb dead-centre at every width; the 640 px boundary flips `margin-top` from
  `-160px` to `0` in step with `app/layout.tsx`'s own `pt-0`.
- `prefers-reduced-motion: reduce`: `transform: none`, `opacity: 1`, 64×64 —
  the intended resting frame.
- Light and dark both correct.
- Exactly one `<h1>`, zero focusable elements, one `role="status"` reading
  "Loading", and the orb `alt=""` + `aria-hidden`.

**Two things `main` moved underneath this while it was in review, both of which
it got wrong first and neither of which any test or screenshot would have
caught.** Worth reading as the actual lesson of this record:

- **ADR-0087** moved the `<main id="main-content">` out of the root layout and
  down into every screen. The first version of this fallback had no `<main>` at
  all, so "Skip to content" would have pointed at nothing for the whole load. It
  is on the outermost element here — correct in this file and wrong in
  `AppShell`, because this one draws no navigation for the landmark to contain.
- **ADR-0089** moved the app's canvas from `bg-primary` to `bg-secondary`, and
  names `app/(app)/loading.tsx` as one of the three files that constant covers.
  This fallback had been written `bg-primary` — the raised card colour — which
  is exactly the drift ADR-0089 had just finished removing, and it would have
  changed the background colour underneath the reader at the moment the orb went
  away. It is `bg-secondary`.

A fallback is the one surface where neither mistake shows up in review: it is
invisible unless you are looking at it during the half-second it exists.

**Not measured:** the hand load itself, signed in, and therefore the transition
from the orb to the real page. The proxy redirects a signed-out request to
`/login` before the layout runs, and this workspace has no session — the same gap
STATE.md records against ADR-0046. It needs a signed-in browser and a throttled
network, and nothing short of that produces the evidence.

## Related

- Feedback: FB-0024, and FB-0010 before it
- Supersedes: ADR-0046
- Precedent: ADR-0018 (the first drift), ADR-0049 (which cut of the mark goes where)
- Code: `app/(app)/loading.tsx`, `components/custom/Wordmark.tsx`, `app/globals.css`
