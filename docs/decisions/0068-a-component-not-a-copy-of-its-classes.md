---
id: ADR-0068
title: A button is the component, not a copy of its classes
status: accepted
date: 2026-08-21
scope: repo
deciders: [Bart]
superseded-by: null
amends: ADR-0066
tags: [ui, design-system, untitled-ui, accessibility]
---

# A button is the component, not a copy of its classes

## Context and problem statement

ADR-0066 closed the component worklist and said every vendored component had a
consumer or a written reason. True, and it left the inverse unchecked: whether
anything was still *painting* Untitled UI rather than *using* it.

Ten client components were. They applied `untitledButton(...)` — a
character-for-character copy of the vendored button's class recipe — to a plain
`<button>` or `<Link>`:

    AccountSettings   CardsProfile   ImportSettings   MenuPopover
    CardAddDialog     CardsSidebar   ProfileSettings  Modal
    CardsView         DeleteAccountSettings

`untitledButtonClasses.ts` exists for elements that genuinely **cannot** be a
React Aria Button, and its header named three: `<summary>`, `<span aria-hidden>`,
`<label>`. None of the ten was one of those. They used the recipe because it was
to hand.

This is the same finding that opened the last worklist — *their classes,
assembled by hand* — one layer down, and the instruction was unambiguous:

> Ik wil gewoon dat de buttons buttons zijn en dat de rest ook allemaal klopt.

*("I just want the buttons to be buttons and the rest to be right too.")*

## Decision 1 — the ten become real buttons

All ten now render a component. Two shapes, depending on what the file already
had: `components/custom/Button.tsx` where the app's own vocabulary and Next
routing are wanted, and the vendored `Button` directly where the file already
imported it or needs `onPress`/`iconLeading`.

**The wrapper grew three props to make this possible, and each is a real gap
rather than a convenience:**

- **`type`** — a form's submit button has no `onClick`; the form's `onSubmit`
  fires. Without this the wrapper fell through to its plain-`<span>` branch and
  would have rendered something that looks like a submit button and submits
  nothing. This is the one change here that could have shipped a silent bug.
- **`disabled`** — spelled the DOM's way and mapped to React Aria's
  `isDisabled`, because every call site was replacing `<button disabled>`.
- **the destructive colours** — `primary-destructive` is what deleting an
  account uses, and the wrapper's colour union had only their first three.

## Decision 2 — one call site keeps the recipe, and the reason is new

`CardAddDialog`'s "Change" button stays a `<button>`. That dialog moves focus by
hand on every state transition — an accessibility fix from ADR-0033's session —
which needs a ref on the real element. The vendored `Button` is typed as a plain
call signature whose props carry no `ref`, so reaching the node would mean
patching vendored code, and ADR-0062 keeps that for crashes rather than comfort.

`untitledButtonClasses.ts`'s header now lists all five reasons and says plainly
that an eleventh call site belongs on the list or in the component.

## Decision 3 — `FilterChips` takes their badge but keeps its own hit area

`BadgeWithButton` is the obvious component for a removable chip and is **not**
used. It puts the cross in a button of its own inside the chip, and only that
cross removes anything: a `size-3` icon with `p-0.5` is a **16px** target, where
WCAG 2.2's 2.5.8 asks **24px**. The whole chip here is one 28px-tall button.

That is ADR-0056's second exception — Card Orb's value survives when it is
argued from a measurement — so `BadgeWithIcon` draws the pill and the cross, the
button around it stays, and the badge is a `<span>` so the nesting is valid.

`Tag.tsx` is deleted; both its call sites use `Badge`. Held is `pill-color`
(filled) and wanted is `modern` (page colour inside a ring), so the distinction
still survives greyscale, which is what the dashed outline it replaces was for.
A ring cannot be dashed; fill-versus-none was the part doing the work.

`ThemeToggle` is their `Button`, `color="tertiary"` — the one colour that draws
no fill until pointed at, which is what a slot beside a text link needs.

## Consequences

- `untitledButtonClasses.ts` is down from seventeen consumers to six, and its
  header is true again.
- **Cards are about 22px shorter per row**, because their `sm` badge is more
  compact than the `Tag` it replaces. Visible on `/collection`, the wishlist and
  every public profile.
- Two token cleanups rode along: `Modal.tsx`'s hand-written
  `rgba(255,255,255,0.8)`/`rgba(34,34,34,0.8)` pair is `bg-glass-solid`, and the
  twenty legacy `--fs-*`/`--fw-*`/`--lh-*` aliases are gone — every one had lost
  its last reader, which is exactly how `gen-tokens.mjs` always said the
  migration would report itself finished. `lib/design/tokens.test.ts` now asserts
  the block is empty rather than that it is full.
- `lib/design/sources.test.ts`'s raw-hex guard walked `app/` and `lib/` only,
  which stopped being where the components live when they moved to
  `components/custom/`. It walks `components/` too now, with the vendored trees
  exempt per ADR-0062.

## Confirmation

`./scripts/verify.sh` exits 0 — 525 tests, typecheck, lint at `--max-warnings 0`,
`gen-tokens --check`, and a production build.

Fifteen screenshots differ from `origin/main` and every one was opened and
accounted for: the icon swap (ADR-0067), the badge's compacter metrics, and the
buttons. No layout broke and nothing went missing. **Getting that comparison at
all required building `origin/main` in a worktree — see ADR-0069, which is the
more important finding of the two.**
