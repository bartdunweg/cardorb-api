---
id: ADR-0088
title: Controls have two shapes, the default is a capsule, and shape is a variable rather than a prop
status: accepted
date: 2026-08-22
scope: repo
deciders: [Bart, Claude]
supersedes: null
superseded-by: null
tags: [design-system, interface, tokens, tailwind]
---

# Controls have two shapes, the default is a capsule, and shape is a variable rather than a prop

> **Written as ADR-0085 and renumbered to 0088 before merging.** Four workspaces
> wrote records against the same `main` on 2026-08-22 and three of them reached
> for 0085; `origin/main` had gained seven commits by the time this branch was
> pushed. Renumbering here was possible because nothing had merged yet — PR #119
> could not, which is why its squash title still says ADR-0085 while the file
> says 0087. ADR-0048's opening warning is about exactly this, and it is not
> hypothetical.

## Context and problem statement

Every button in the app was one shape. `components/base/buttons/button.tsx`
wrote `rounded-lg` — Tailwind's 8px — five times, once per size, with
`before:rounded-[7px]` beside it for the inner border that sits 1px inside the
edge. Inputs and input groups matched it. Asking for a different shape meant
overriding `className` at the call site, one control at a time.

The owner asked for two shapes, with the default flipped:

> Ik wil graag voor card- of rounded buttons gebruiken. Of tenminste, in ieder
> geval, ik wil zowel rectangle buttons als rounded buttons hebben, maar de
> standaard is rounded buttons. En dan, op sommige plekken waar ik het aangeef,
> wil ik dan rectangle buttons. Maar we moeten dus allebei supporten.

Four questions settled what those two words mean, because both were ambiguous
against what the app already drew:

- **Round** is a true capsule — 999px, `radius.btn` — not "softer than now".
- **Rectangle** is 8px, `radius.orbSm`: exactly what every button already wore.
- Scope is buttons **and** single-line inputs, selects and input groups.
  Textareas were to stay rectangular; there is no textarea component in this
  repo, so that costs nothing today and is written down for whoever adds one.
- Round gets more side padding than rectangle.

The owner left the API shape to us. That is the decision this record is mostly
about.

## Decision

### Shape is a cascading custom property, not a prop threaded into class strings

`--radius-control` and five `--control-px-*` are declared in `:root` and read by
every control. Two generated `@utility` blocks reassign them:

| Class | Sets |
|---|---|
| `shape-round` | `--radius-control: var(--radius-btn)` (999px) — also the `:root` default |
| `shape-rectangle` | `--radius-control: var(--radius-orb-sm)` (8px) |

`<Button shape="rectangle">` is sugar: it adds one of those two classes to the
element.

The alternative was a `shape` prop passed down into the class strings of
`button.tsx`, `button-group.tsx`, `input.tsx`, `input-group.tsx` and
`untitledButtonClasses.ts`. Rejected for three reasons, in order of weight:

1. **A block cannot be shaped that way.** `<div className="shape-rectangle">`
   makes a whole form, toolbar or dialog footer rectangular, and the controls
   inside it need to know nothing. With a prop, every call site inside the block
   has to be edited, and a control added later silently misses out.
2. **It nests and undoes correctly.** `shape-round` inside a rectangle block
   wins, because that is what the cascade does. A descendant-selector variant —
   `@custom-variant rect ([data-shape=rectangle] &)` — was the other candidate
   and cannot undo itself: the ancestor still matches.
3. **Five files stop needing to know about shape.** `untitledButtonClasses.ts`
   required no change at all; it imports `styles` from `button.tsx` and
   inherited both radius and padding.

No new radius values were needed. `radius.btn` (999px) and `radius.orbSm` (8px)
already existed. `btn`'s comment claimed it was "what every labelled button on
the site wears", which went stale at ADR-0056 and is close to true again.

### Padding is two scales, not one plus a bonus

A capsule's corner curves away from its text for the control's full height, so a
word set at the rectangle's padding reads as touching the edge even though it
measures the same gap. `controlPx` (round) is `controlPxRect` (rectangle) plus
4px at every size: 10/12/14/16/18 → 14/16/18/20/22.

One variable per size rather than a single shared `+4px`, so a size that looks
wrong on screen can be tuned alone. Vertical padding is untouched, so control
heights are identical before and after — 32/36/40/44/48px, measured.

### What did not change shape

Deliberate, and each for its own reason:

- **The dropdown menu panel** (`dropdown.tsx:148`) and its items. A 999px
  popover is broken. The dropdown *trigger* is a `<Button>` and did change.
- **Checkboxes, toggles, badges, cards, dialogs, avatars, card artwork.** Not
  controls in this sense.
- **The tab bar and the round icon buttons.** Already capsules and circles.
- **`FilterChips` and `BrowseSetGrid`'s chips**, on `rounded-pill` (14px). On a
  small chip 14px already reads nearly round, so flipping them buys little and
  would fork two files off the shared recipe. A judgement call, not an oversight.

## Two bugs found on the way, one of them live

### `tailwind-merge` did not know this project's radius names, and never had

`cx` is `extendTailwindMerge`, which knows Tailwind's own scale by heart and
treats everything else as a class it has never heard of. A class in no group
never replaces another, so `cx("rounded-lg", "rounded-orb-sm")` returned **both**
— and which one the element actually wore came down to whichever rule Tailwind
emitted later. That is the same "two utilities on one element, order decided by
the compiler" hazard as ADR-0012 and ADR-0017.

Two live call sites depend on the override winning: `SigninShell`'s wide button
and `ViewOptions`' segments each pass a `rounded-orb-*` through `className`. It
went unnoticed because the base was 8px and the override was 8px, and a coin
flip between two identical values always lands right. With a capsule as the
base, it stops landing right.

`utils/cx.ts` now declares the radius scale, **derived from `tokens.ts`** rather
than typed out, because a hand-kept list stops covering the scale the first time
somebody adds to it — which is this same bug one rung up. Six assertions in
`lib/design/shape.test.ts` cover it, and were confirmed to fail without the fix.

### `--radius-control` is a name with a history, and the guard did not regress

ADR-0054 records `/brand` drawing its colour swatches with
`rounded-[var(--radius-control)]` when no such token had ever existed: the
declaration was dropped, the corners came out square, and nothing failed until
`vars.test.ts` was pointed at `.tsx`. The token is real now. `/brand` still says
`rounded-pill` there, deliberately — that swatch documents a fixed shape rather
than wearing whatever shape a control happens to be in.

## Consequences

- **`vars.test.ts` reads two things it could not read before.**
  `components/base` is now in its scan list: it was excluded while the vendored
  tree only referenced Untitled UI's own theme variables, and once Card Orb's
  tokens started appearing in there, "vendored" stopped being a reason not to
  look. And it now matches Tailwind v4's `px-(--token)` shorthand, which
  compiles to the identical declaration and fails in the identical silent way
  but contains no `var(` for the old regex to find. Without that, the shorthand
  would have been the one form of token reference in the project that nothing
  checks.
  - Pointing it at `components/base` surfaced one exemption, verified rather
    than assumed: `--trigger-anchor-point` is written onto the popover element
    by React Aria in JS, at the moment it positions it
    (`node_modules/react-aria-components/dist/private/Popover.cjs`). No
    stylesheet will ever contain it.
  - The guard-on-the-guard for the new branch failed on its own first run,
    because a test *title* is a string and not a comment, so the
    comment-stripping did not reach the example token in its name. Which is the
    guard working, but a poor way to say so; the title names no example now.
- **`components/custom/Button.tsx` still hand-copies the `md` recipe, and the
  plan to delete it was wrong.** The intent was to replace it with
  `untitledButton({ size: "md" })`, per ADR-0068. That file has no
  `"use client"`, and `untitledButtonClasses.ts` does — a server component may
  *render* a client component but may not read a value out of one, so at
  prerender `styles.common` is `undefined`. That is the /_not-found crash
  ADR-0068 itself describes. The copy stays, reads the shape variables, and
  regains the `before:` inner border it had silently been missing. Its
  pinning to `secondary`/`md` regardless of props is left alone and marked; no
  call site passes them on that branch.
- **`signinWideButtonClassName` (`SigninShell.tsx:91`) has no consumers.** Found
  while checking whether its `rounded-orb-sm` override would now fight the
  capsule. It will not, because nothing renders it. Left in place; deleting dead
  code is not this change's subject, but the next person to touch that file
  should know.
- Neutral: `utils/cx.ts` now imports `lib/design/tokens.ts`. That module is
  plain TypeScript with no directive, so it is safe from either side of the
  server/client line.

## Confirmation

- `npm run check` exits 0: prettier, `gen-tokens --check`, both typecheck
  passes, **542 tests** (up from 525 — 17 new in `shape.test.ts`), lint.
  `scripts/verify.sh` fails only on `standards`, which **fails identically on a
  clean tree** — a CLAUDE.md generated from v0.22.0 against a v0.23.0 standard,
  plus three warnings about `docs/` being where ADR-0053 deliberately keeps it.
- **The utilities were read out of the built CSS rather than assumed**, which is
  the step ADR-0054 records as the one that catches a token reaching `:root`
  with no utility behind it:
  - `.shape-round{--radius-control:var(--radius-btn);--control-px-xs:14px;…}`
  - `.shape-rectangle{--radius-control:var(--radius-orb-sm);--control-px-xs:10px;…}`
  - `.rounded-control{border-radius:var(--radius-control)}`
  - `.before\:rounded-control-inner:before{…border-radius:var(--radius-control-inner)}`
  - `.px-\(--control-px-md\){padding-inline:var(--control-px-md)}`
  - `.first\:rounded-l-control:first-child{…}` — the bare `rounded-l-control` is
    absent, correctly: it is only ever used behind a variant.
- **Measured in a browser against a production build**, both shapes, all five
  sizes, on `/brand`:

  | Size | Round | Rectangle | Height (both) |
  |---|---|---|---|
  | xs | 999px / 14px | 8px / 10px | 32px |
  | sm | 999px / 16px | 8px / 12px | 36px |
  | md | 999px / 18px | 8px / 14px | 40px |
  | lg | 999px / 20px | 8px / 16px | 44px |
  | xl | 999px / 22px | 8px / 18px | 48px |

  The rectangle column is the pre-change value at every size, which is the whole
  claim of that shape. Heights are unchanged, so nothing re-registers vertically.
- **The screenshot harness was run properly, baselined against the pre-change
  tree** (`git stash -u` → `visual:baseline` → `stash pop` → compare), 35 shots
  across public and signed-in routes. **Read carefully, because the first two
  compare runs were worthless and said so quietly:** `reuseExistingServer: true`
  meant they photographed a server left over from the baseline run, serving
  pre-change code. The real run was done against a server started by hand from a
  fresh build, verified first by curling `/login` for `rounded-control` and then
  by reading `--radius-control` out of the live page as `999px`.
  - **1 of 35 failed: the filter menu, at 4,476 pixels (1.0%).** Every red region
    in the diff is a control that should have moved — the View and Filter
    buttons, the Era segmented control, the add button in the rail. The new
    screenshot was opened and checked, not just counted.
  - **34 passed, and that is a weaker statement than it looks.** The threshold
    is `maxDiffPixelRatio: 0.001`, sized for antialiasing. A capsule differs
    from an 8px rectangle only in the corners, and the app's full-width buttons
    centre their text so the padding change moves nothing — roughly 400 pixels
    on a 1.4-megapixel page. So those 34 say *no layout shifted*, which is the
    useful signal, and they do **not** say the shape did not change. The
    computed-style measurements above are what says that.
