---
id: ADR-0084
title: The last four undefended buttons become the component, and two of them need Untitled UI's directly
status: accepted
date: 2026-08-21
scope: repo
deciders: [Bart, Claude]
superseded-by: null
tags: [untitled-ui, buttons, accessibility]
---

# The last four undefended buttons become the component, and two of them need Untitled UI's directly

## Context and problem statement

PR #116 (`dd099b7`) rewrote the header of `components/custom/untitledButtonClasses.ts`
after auditing every claim in it. Three of its four stated reasons for a plain
`<button>` turned out to be untrue:

- FilterSheet and ViewSheet were not `<details>/<summary>`.
- AvatarPicker's trigger was not a `<label>`.
- PublicCardDialog's arrows were real `<button disabled>`, not `<span aria-hidden>`.

That commit was comment-only. It said so plainly — "Converting them is its own
change; until somebody does, this file is carrying them rather than justifying
them" — and left eight call sites across four files wearing the class string with
no reason to.

This record is that change. The question it had to answer is not *whether*
(#116 settled that) but **which button component each of the eight gets**, since
this repo has two: `components/custom/Button.tsx`, the ADR-0068 wrapper carrying
this app's vocabulary, and the vendored `components/base/buttons/button.tsx`.

## Decision

**All eight become the component. Six use the wrapper; two use Untitled UI's
Button directly, because the wrapper cannot express what they need.**

| Call site | Which | Why |
| --- | --- | --- |
| FilterSheet's Cancel and Apply | wrapper | children, colour, className — nothing else |
| ViewSheet's Done | wrapper | same |
| AvatarPicker's Upload/Change | wrapper | `disabled` is already the wrapper's own spelling |
| FilterSheet's Filter trigger | vendored | `aria-haspopup`, and a trailing slot for the `<Badge>` |
| ViewSheet's View trigger | vendored | `aria-haspopup` |
| PublicCardDialog's two arrows | vendored | icon-only: the wrapper requires `children` |

**The wrapper is deliberately not widened to take all eight.** It exists for one
job — routing a `<Button href>` through Next's client router — plus two of this
app's conventions. Adding `aria-haspopup`, an arbitrary trailing node and an
optional-children mode would make it a second, thinner copy of the component it
wraps, which is the drift ADR-0068 was written against. Reaching past it for the
two sites that need the real thing is cheaper and says more.

**`size="md"` is passed explicitly at every vendored call site, and it is not a
style choice.** `untitledButton()` defaulted to `md`; the component defaults to
`sm`. Omitting it would have silently shrunk five controls.

Three things the component now does that hand-written classes were doing badly
or not at all:

- **The disabled styling is the component's.** `AvatarPicker` was pasting
  `opacity-55 cursor-not-allowed` beside a recipe that already carried
  `disabled:opacity-50 disabled:cursor-not-allowed`. Two answers to the same
  question, differing by 5%. **This is the only one of the three that was a
  live defect**, and it shows only while an avatar is uploading — measured, the
  arrows in `PublicCardDialog` were already at `opacity: 0.5`, because they took
  it from `styles.common.root` through the class recipe.
- **The square icon shape is the component's.** `untitledIconButton` pasted
  `aspect-square p-2.5`; the component sets `data-icon-only` itself when an icon
  arrives with no children, and `md`'s own rule is `data-icon-only:p-2.5`.
  Measured identical either way: 40×40 with 10px padding, before and after.
- **The badge goes in the trailing slot rather than among the children**, because
  the component wraps `children` in its own `data-text` span and a count badge is
  not text. To be clear about what this did *not* fix: the badge was already a
  direct child of the button, so nothing moved on screen. This is about which
  slot it occupies, not a bug.

**`AvatarPicker`'s button keeps `type="button"` even though it has no `onClick`,
and that is load-bearing.** The vendored `FileTrigger` clones its single child
and injects an `onClick`; the wrapper decides between a real button and its
plain-`<span>` mode from its own props, and `type` is the half of that test that
does not depend on the clone having happened. Without it the control would work
today by luck.

## Alternatives considered

- **Widen `components/custom/Button.tsx` to cover all eight.** Rejected above:
  it turns a routing shim into a rival API for the component it wraps.
- **Use the vendored Button for all eight and skip the wrapper.** Consistent, and
  it throws away the app vocabulary ADR-0068 deliberately built — `disabled`
  rather than `isDisabled`, and the size default that matches this app.
- **Leave them, since they render correctly today.** What #116 already rejected.
  They render correctly and they were being defended by a paragraph that was
  false, which is worse than being undefended.

## Consequences

- `untitledButtonClasses.ts` is down to **two importers and five call sites**:
  `CardNav.tsx` (two Next `<Link>`s, two `<span aria-hidden>`) and
  `CardAddDialog.tsx` (the "Change" button that needs a ref). Every one is an
  element a React Aria Button cannot be, so the file's header is a list of real
  reasons for the first time.
- **ADR-0068's consequence line is now stale**, and it is immutable, so this is
  where the current count lives. It says the header "lists all five reasons one
  is allowed" and counts six consumers; both were true when written and neither
  is now.
- **The count in that header has been wrong in two successive versions** — five
  where there were seven, then seven files where there were six and seven call
  sites where there were thirteen. The header now carries the grep that settles
  it. A number written from memory in this file has a track record.
- The two vendored call sites are the first in `components/custom/` to import
  `components/base/buttons/button` for its component rather than its `styles`.
  That is fine — `button.tsx` is `"use client"` and both consumers already are —
  but it is a path this repo had not used before.

## Measured

Against a build of `origin/main` in a worktree, following ADR-0069, with a real
signed-in session at 390px:

- **The only pixel change is +4px of width on the three buttons that have both
  an icon and a label**: Filter 81.42 → 85.42, View 81.67 → 85.67, the avatar's
  Change 80.53 → 84.53. Height (40px), padding (14/14), gap (4px) and the icons
  themselves are unchanged. The 4px is `px-0.5` on the component's own
  `data-text` span — text padding the class recipe could not apply, because a
  class string has no children slot. Consistent with every other labelled button
  in the app, which is the point.
- **Nothing else on any page differs.** 33 screenshots against the reference
  build: 30 identical, and the 3 that differ are the 390px collection, wishlist
  and public profile — the only widths where these sheets render. Each diff is
  420 pixels, 0.01 of the image, confined to those two buttons.
- **Every element kept its identity**: still `<button type="button">`, still
  `aria-haspopup="dialog"` on both triggers, `aria-label="View options"` intact.
- **The keyboard is unchanged.** Tab order inside the open filter sheet is
  identical before and after, and still reaches Cancel and Apply.
- **`FileTrigger` still yields a real `<button type="button">`**, which is the
  evidence behind the `type` argument above.

Not measured: the avatar's *saving* state, which is the one live defect fixed,
because it exists only during an upload.

## Related

- `dd099b7` — the audit that proved the defence untrue and named this change.
- `docs/decisions/0068-a-component-not-a-copy-of-its-classes.md` — the wrapper,
  and the `type`/`disabled`/destructive-colour additions this change consumes.
- `docs/decisions/0062-vendored-code-has-its-own-rules.md` — why `FileTrigger`'s
  `cloneElement` behaviour is worked with rather than patched.
