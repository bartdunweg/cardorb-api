---
id: ADR-0053
title: The design system reaches the className, not just the stylesheet
status: accepted
date: 2026-08-19
scope: repo
deciders: [Bart]
superseded-by: null
tags: [design-system, tailwind, tokens]
---

# The design system reaches the className, not just the stylesheet

## Context and problem statement

Asked to set the design system up better. It was not obviously broken: there is
a token module (`lib/design/tokens.ts`), a generator that writes the stylesheet
from it (`scripts/gen-tokens.mjs`), a check that fails on a diff, contrast tests
that hold every colour to a measured ratio, and a screenshot harness (ADR-0051).
That is more than most projects this size have.

The defect was in what the system could *reach*, and it is measurable rather
than a matter of taste.

**Only a token inside Tailwind's `@theme` becomes a utility.** Colour and radius
were there, so a component writes `text-label` and `rounded-btn`. Everything
else — the type scale, the weights, the line-heights, the families, the easing,
the durations, the blur tiers, the stacking order — was declared as an ordinary
custom property in `tokens.css`, which Tailwind cannot see. So the only way to
reach any of it from a className was the arbitrary-value escape hatch:

```
"h-[var(--control-h)] [font-family:var(--font-main)] " +
"[font-size:var(--fs-control-label)] [font-weight:var(--fw-button)]"
```

Measured before this change: **721** `var(--…)` references inside `.tsx` and
`.ts`, against about 200 in the stylesheets themselves. The top five were
`--fs-small` (77), `--font-body` (70), `--font-main` (49), `--fw-title` (34) and
`--dur-fast` (22).

That is the whole finding. The system existed and stopped at the door of the
language every component in this project is written in — which is why every
class recipe reads like a stylesheet transcribed into a string, and why the two
copies of the control recipe that ADR-0052's follow-up work found could drift
in the first place.

## Decision

**Every scale that is one value regardless of theme or viewport moves into
`lib/design/tokens.ts` and is generated into `@theme`.** The generator now
writes four things instead of two:

1. `@theme` — what turns a token into a utility. `text-small`, `text-body-l`,
   `text-control-label`, `font-title`, `font-button`, `font-main`,
   `leading-tight`, `ease-smooth`, `blur-glass`, `backdrop-blur-glass`.
2. `:root` — the same values as ordinary custom properties, because Tailwind v4
   tree-shakes theme variables it sees no utility for and most of the CSS here
   is still hand-written.
3. `@utility` blocks for the two kinds that **cannot** live in `@theme`, listed
   in `tokens.ts` as `utilities` so the generator is not the thing that knows
   which parts of the system exist:
   - **the shadows**, which are three layers in light and two in dark. A
     different *shape*, not a different value, so `light-dark()` — a colour
     function — cannot express it. The value stays in `tokens.css` beside its
     dark block; `shadow-card` and `shadow-elevated` read it.
   - **the layout constants** (`--control-h`, `--page-pad-x`, `--card-pad`,
     `--content-max`, `--main-pad-top`, `--page-pad-bottom`, `--tabbar-pill-h`),
     every one of which is redefined at a breakpoint. Same treatment:
     `h-control`, `px-page`, `p-card`, `max-w-content`.
   - the same mechanism gives `duration-fast`/`normal`/`slow` and the seven
     `z-*` classes, because Tailwind has no namespace for either.
4. **An alias block.** `--fs-small: var(--text-small)`, and its like for `--fw-*`
   and `--lh-*`. A `var()` at the canonical name, never a second copy of the
   value, so the several hundred call sites still written the old way keep
   resolving while they are migrated one portion at a time. **An empty alias
   block is how this migration reports that it is over.**

**`duration-*` sets Tailwind's `--tw-duration` as well as the longhand.** Not
belt and braces: `transition-*` in v4 emits
`transition-duration: var(--tw-duration, …)`, so a bare longhand would be at the
mercy of which declaration Tailwind emits last — the same "two utilities on one
element, order decided by the compiler" hazard that stopped `.btn--primary`
moving (`controlClasses.ts` records it).

### What deliberately did not move

- **The spacing scale.** `--space-1` … `--space-12` are 4, 8, 12, 16, 20, 24,
  28, 32, 40, 48 with half-steps at 10 and 14 — Tailwind's default scale, step
  for step. `p-4` already *is* `--space-4`. Promoting it would generate a second
  name for utilities that exist. The ~60 `[padding:var(--space-N)]` call sites
  are a straight deletion to `p-N` and need no token work at all.
- **`--fs-label`.** The one omission that is a collision rather than a
  principle. It would have to be `--text-label`, and `--color-label` already
  owns the `text-label` class; Tailwind resolves one of the two and says
  nothing, which is how a colour used in forty places silently becomes a font
  size. Nothing in this app reads `--fs-label` any more, so it stays in
  `tokens.css` unpromoted rather than being renamed into the scale.
- The glass surfaces and borders, whose argument is prose belonging beside the
  value.

### Two guards, because a scale that can be wrong silently will be

- **`vars.test.ts` now reads `.ts`/`.tsx`, not just `app/styles`.** It asserted
  that every `var()` resolves to a declared token, over the ~200 references in
  the sheets, while the ~720 in the components — the larger half, and the half
  being rewritten — went unchecked. Tailwind passes an arbitrary value through
  to the browser verbatim without ever asking whether the name exists, and a
  missing custom property is silent: the declaration is dropped and the element
  inherits.
- **`tokens.test.ts` gains the ordering rule `tokens.css` claimed a test held.**
  Its comment read *"a floor is chosen against its neighbours, not against its
  own ceiling, and design-system.test.ts holds the ordering to it"*. That file is
  not in this repo — the same shape of gap the contrast comments had. It also
  asserts every scale reaches `@theme` (a token in `:root` alone generates no
  utility and fails silently) and that every alias is a `var()` rather than a
  copy.

## Consequences

- Good, because the recipe every control on the site wears is now readable.
  `controlClasses.ts` was migrated as the proving portion, chosen because it is
  the recipe worn by the most elements — if a token behind one of these classes
  were wrong, any page would say so:

  | Was | Now |
  |---|---|
  | `h-[var(--control-h)] [font-family:var(--font-main)] [font-size:var(--fs-control-label)] [font-weight:var(--fw-button)]` | `h-control font-main text-control-label font-button` |
  | `[backdrop-filter:blur(var(--blur-glass))] [-webkit-backdrop-filter:blur(var(--blur-glass))] [box-shadow:var(--shadow-card)]` | `backdrop-blur-glass shadow-card` |
  | `[transition:box-shadow_var(--dur-fast)_var(--ease-smooth),border-color_…,transform_…]` | `transition-[box-shadow,border-color,transform] duration-fast ease-smooth` |

- Good, because the new guard found a real bug on its first run, on the page
  whose job is documenting the design system. `/brand` drew its mark panels with
  `rounded-[var(--radius-card)]` and its colour swatches with
  `rounded-[var(--radius-control)]`. **Neither token has ever existed**, so both
  resolved to nothing and both were drawn with square corners. Now `rounded-lg`
  and `rounded-pill`. This is precisely the failure `vars.test.ts` was written
  for after five invented variables compiled clean, caught the first time the
  test was pointed at the file type where the invented variables live.
- **Bad, and the one thing to look at: `leading-relaxed` moved from 1.625 to
  1.7, and two live pages re-typeset.** The token `--lh-relaxed` has always been
  1.7; three call sites wrote Tailwind's `leading-relaxed` believing it meant the
  same thing, and got 1.625. Promoting the scale ends that — a design system
  where `leading-relaxed` disagrees with `--lh-relaxed` is two answers to one
  question — but the marketing lede is set on it, so everything below shifts.
  Measured: 69,901–87,377 pixels across the six marketing screenshots, all of it
  vertical re-registration of text below the first paragraph. **Taken
  knowingly.** The one-line revert is `leading.relaxed` in `tokens.ts`.
- Neutral: `ease-out`, `ease-in-out` and `font-mono` now resolve to the house
  values rather than Tailwind's, on five call sites between them. Timing and a
  near-identical font stack; the screenshots below say it moved nothing.
- Neutral: 721 escape hatches → 706. This portion was chosen for what it proves,
  not for its count. The remainder is a sweep, and the rule for it is ADR-0052's:
  one portion, screenshots between, and a class moves when the move makes it
  easier to read.

## Confirmation

- `scripts/verify.sh` exits 0 on Node 24 — secrets, format, tokens, typecheck,
  478 tests, lint, build.
- **The screenshot harness was run properly, baselined against the pre-change
  tree** (`git stash` → `--update-snapshots` → `stash pop` → compare), which is
  what makes the numbers above mean anything: nine shots, three pages, three
  widths.
- **It caught the line-height change on the first run** — six of nine failed —
  and the cause was isolated by experiment rather than reasoning: setting
  `leading.relaxed` back to 1.625 made **all nine pixel-identical**. So
  everything else in this change, the whole token move and the button recipe
  rewrite included, is proven pixel-neutral, and the one thing that is not is
  known to be the only thing.
- The generated utilities were verified in the compiled CSS rather than assumed:
  `.text-control-label{font-size:var(--text-control-label)}`,
  `.h-control{height:var(--control-h)}`,
  `.shadow-card{box-shadow:var(--shadow-card)}`,
  `.duration-fast{--tw-duration:var(--dur-fast);transition-duration:var(--dur-fast)}`.
- Not confirmed: anything behind a login. The harness has an owner project that
  needs a service-role key; only the public project was run.

## Related

- Builds on: ADR-0051 (the harness), ADR-0052 (the rule for what moves)
- Repairs the reasoning of: ADR-0012, 0017 (a utility silently losing or winning)
- Code: `lib/design/tokens.ts`, `scripts/gen-tokens.mjs`, `app/styles/tokens.css`,
  `app/components/controlClasses.ts`, `lib/design/tokens.test.ts`,
  `lib/design/vars.test.ts`
