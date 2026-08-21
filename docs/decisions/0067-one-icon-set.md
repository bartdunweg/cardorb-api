---
id: ADR-0067
title: One icon set — @untitledui/icons, and lucide-react is removed
status: accepted
date: 2026-08-21
scope: repo
deciders: [Bart]
superseded-by: null
tags: [ui, design-system, untitled-ui, icons, dependencies]
---

# One icon set — `@untitledui/icons`, and `lucide-react` is removed

## Context and problem statement

An audit asked whether every component in the app is an Untitled UI component
now. The components largely were. The **icons were not, and nothing recorded
the choice**: `lucide-react` was imported by 25 authored files while
`@untitledui/icons` was imported by 3, and both shipped, because Untitled UI's
own vendored components import their own set regardless.

This is the one thing in the sweep that was a genuine fork rather than work, so
it was the one thing asked:

> Swap everything to @untitledui/icons

ADR-0056 already made Untitled UI the default and said a case that is still even
after both exceptions takes Untitled UI's value. Two icon sets was not even a
close case; it was an unrecorded accident.

## Decision

**`@untitledui/icons` is the app's only icon set.** `lucide-react` is removed
from `package.json`. Twenty-eight distinct icons were in use; every one has a
counterpart, verified against the installed package before any file was touched.

    ArrowUpRight -> ArrowUpRight      Plus     -> Plus          Sun   -> Sun
    Check        -> Check             List     -> List          Heart -> Heart
    ChevronLeft  -> ChevronLeft       ChevronRight -> ChevronRight
    BookOpen -> BookOpen01   Camera  -> Camera01    Download -> Download01
    LogOut   -> LogOut01     Moon    -> Moon01      RefreshCw -> RefreshCw01
    Rows3    -> Rows03       Search  -> SearchLg    User      -> User01
    Wallet   -> Wallet01     X       -> XClose      Share2    -> Share01
    Layers   -> LayersThree01   ExternalLink -> LinkExternal01
    TrendingUp -> TrendUp01     Smartphone   -> Phone01
    LayoutGrid -> Grid01        LayoutDashboard -> LayoutAlt01

**Where the local name carries meaning the numbered one does not, the import is
aliased** — `LayersThree01 as Layers`. The numbers are Untitled UI's internal
variants, not vocabulary, and `<Layers />` at the call site says more than
`<LayersThree01 />`. Where the old name was a *lucide-ism* the alias was
dropped instead and the real name used: `Settings2`, `Rows3` and `LayoutGrid`
meant "lucide's second settings glyph" and so on, and preserving that would have
been carrying a dependency's vocabulary after removing the dependency.

The props survive the swap unchanged. Their icons take `size` and spread the
rest onto the `<svg>` after their own defaults, so `size={16} strokeWidth={1.75}`
keeps working and `aria-hidden` is now their default rather than something each
call site says.

## Three mappings were judgement calls, and two were wrong the first time

Named here because the record should not pretend the table above fell out
mechanically:

- **`Settings2` → `Settings01` was wrong.** lucide's `Settings2` is a pair of
  sliders; `Settings01` is a gear. The control it labels is **View** — group by,
  sort, layout, per row — and a gear reads as "settings", which is a different
  screen in this app. Corrected to **`Sliders02`**. Caught by comparing
  screenshots against `origin/main`, not by review.
- **`Compass` → `Compass` was wrong**, despite the names matching exactly.
  lucide's Compass is the navigational one, a circle with a needle. Untitled
  UI's plain `Compass` is a *drafting* compass — a different object. Corrected
  to **`Compass03`**, which is the circle-and-needle. **An identical name is not
  an identical icon.**
- **`LayoutDashboard` → `LayoutAlt01`** stands, and is the remaining judgement
  call. `Grid01` is closer to what shipped (four squares) but is already the
  grid-view toggle in `ViewOptions`, and one glyph for "the dashboard" and "draw
  the cards as a grid" is worse than a slightly different panel.

## Consequences

- One fewer dependency, and the bundle stops carrying two icon sets.
- **The app visibly changes**, which ADR-0056 already accepted as the cost of
  adopting the library rather than re-implementing it. The glyphs are drawn on a
  different grid and at a different weight.
- `components/custom/Button.tsx` no longer imports `LucideProps`. It exports its
  own `IconProps` (`SVGProps<SVGSVGElement> & { size?: number }`), spelled out
  because the icon package exports the icons and not that type.
- Anything added later that wants an icon takes it from `@untitledui/icons`.
  There are 1,180 of them; needing a second set is a decision, not a shortcut.

## Alternatives considered

- **Keep `lucide-react` and write down why.** Defensible on churn grounds — 25
  files — and rejected: it means the app's chrome and the library's own
  components draw from two different hands, which is the drift ADR-0056 exists
  to stop.
- **Keep both, each for its own layer.** This is what the repository was already
  doing by accident, and nobody could have said where the line was.

## Confirmation

`./scripts/verify.sh` exits 0. The screenshot harness was run against baselines
generated from a build of `origin/main` in a worktree — see ADR-0068, which
explains why that was necessary and what it exposed about the harness.
