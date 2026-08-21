---
id: FB-0024
date: 2026-08-22
source: Bart
source-type: stakeholder
severity: 3
sentiment: negative
status: addressed
tags: [loading, skeleton, interface, app-shell, repeat]
---

# The rewritten skeleton is still not the skeleton of the page it stands in for

## What was said

> "Het laden van het scherm heeft een soort skeleton-ding, maar dit is helemaal
> niet de skeleton van de pagina zelf. Voor mij hoeft het ook niet per se een
> skeleton te zijn; het kan ook gewoon een algemene loader zijn of iets
> dergelijks, voor nu.
>
> Maar hoe het nu werkt, ziet er in ieder geval niet uit. Dus kun je met een plan
> komen om dat te fixen?"

English: "The screen's loading has a sort of skeleton thing, but this is not the
skeleton of the page itself at all. For me it doesn't have to be a skeleton
either; it could just be a general loader or something like that, for now. But
the way it works now, it does not look good at all. So can you come up with a
plan to fix that?"

## Context

Said unprompted, from using the signed-in app. `app/(app)/loading.tsx` as
shipped after ADR-0046: a rail outline, a heading outline and one large grey
block, all sweeping.

This is the second report of the same thing. FB-0010 made the identical
complaint six days earlier, was answered with ADR-0046, and is marked
`addressed`. It was not.

## Interpretation

**ADR-0046's rule was right and its conclusion was wrong.** The rule — a shared
fallback may only draw what it can know is true on every route in the group —
still holds. But applying it to a skeleton produces a shape that is by
construction the layout of no real page. Making it *more* honest made it *look*
worse: the old version at least resembled `/cards`. A grey rail beside a grey
title beside a grey slab resembles nothing, and reads as a broken interface
rather than as waiting.

The mistake was treating "skeleton" as the fixed part of the problem and the
contents as the variable. It is the other way round. A skeleton is a promise
about the layout that is coming; a shared fallback cannot make that promise, so
it should not use the form that makes it.

Bart's "it doesn't have to be a skeleton" is the permission that was missing
last time. Four options were put up; he chose the small one, deliberately marked
"for now": one calm brand loader, no fake chrome at all.

The real fix is still the one FB-0010 left open and ADR-0046 called "the better
end state and not rejected on merit — it is deferred": stream the collection so
the shell renders for real and only the content area waits. `layout.tsx` already
has `viewer` before the slow await, and the rail and tab bar need almost nothing
else. That stays deferred, on purpose, and stays written down.

## Action

- [x] `app/(app)/loading.tsx`: replaced with the orb, centred and breathing, on
      the app background. Nothing else on screen. 275 lines out, 129 in.
- [x] Deleted what that orphaned: `skeletonClassName`, `@keyframes
      skeleton-sweep`, and a `.skeleton::after` reduced-motion block that had
      already been dead since the Tailwind migration.
- [x] ADR-0091, superseding ADR-0046 — the rule survives, the conclusion does not.
- [ ] Not done, again, and still the right answer: streaming the shell. The
      trigger stays what ADR-0046 set — anyone touching AppShell's props.
- [ ] Not measured: the hand load signed in, and so the jump from the orb to the
      real page. No session in this workspace; the proxy redirects a signed-out
      request before the layout runs. Same gap ADR-0046 was left with.

## Related

- Repeat of: FB-0010, same complaint, marked addressed
- Decision: ADR-0091, superseding ADR-0046
- Changelog: docs/changelog.d/2026-08-22-the-loading-screen-is-the-orb.md
- Precedent: ADR-0018, the first time this file drifted from what it stands in for
