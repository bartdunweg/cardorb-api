---
id: ADR-0085
title: The main landmark belongs to each screen, not to the root layout
status: accepted
date: 2026-08-21
scope: repo
deciders: [Bart, Claude]
superseded-by: null
tags: [accessibility, layout, routing]
---

# The main landmark belongs to each screen, not to the root layout

## Context and problem statement

An accessibility review returned this as a HIGH finding, and `STATE.md` has
carried it unfixed since: **the skip link lands before the navigation it skips.**

`app/layout.tsx` held the app's only `<main id="main-content">`, wrapped around
`{children}`. `AppShell` renders `<AppSidebar>` and `<AppTabBar>` *inside*
`{children}`. So on every signed-in route the landmark contained the entire
navigation, and "Skip to content" moved a keyboard user past exactly one thing:
the `LiveDataWarning` bar above it.

Measured before the change, at 1280px with a real session — Tab, Enter, Tab:

| Route | Navs inside `<main>` | Where focus landed |
| --- | --- | --- |
| `/collection` | 2 | `Card Orb home` (the navbar link) |
| `/dashboard` | 2 | `Card Orb home` |
| `/` | 1 | `Card Orb home` |
| `/privacy` | 1 | `Card Orb home` |

The same wrong answer on four different kinds of page.

**Why nothing caught it.** A skip link has no appearance until it is focused,
and a landmark has none ever. Thirty-three screenshots across three widths were
all correct and none of them could have shown this.

## Decision

**The root layout's `<main>` becomes a plain `<div>`, and every screen renders
its own `<main id="main-content">` after its own navigation.**

The wrapper keeps the exact classes it had — `ml-0 pt-[var(--main-pad-top)]
[@media(max-width:640px)]:pt-0` — so the six shells that cancel that padding
with `-mt-[var(--main-pad-top)]` are cancelling the same box as before. Nothing
about `--main-pad-top` moves.

Where it lands, and the rule behind it: **the landmark is the content pane, not
the grid around it.** In `AppShell` and in `CardsView`'s public branch the rail
and the tab bar are the content pane's *siblings*, so a landmark drawn around
all three is a landmark with the navigation inside it — which is the bug.

| File | Covers |
| --- | --- |
| `app/(app)/AppShell.tsx` | all ten signed-in routes |
| `app/(app)/loading.tsx` | the Suspense fallback for those routes |
| `components/custom/CardsView.tsx` (public branch) | `/user/<name>` |
| `components/custom/SigninShell.tsx` | login, signup, forgotten, set-password, 404 |
| `components/custom/LegalPage.tsx` | `/privacy`, `/terms` |
| `app/page.tsx`, `app/app/ios/page.tsx`, `app/brand/page.tsx` | the marketing pages |
| `app/welcome/page.tsx`, `app/cards/[id]/page.tsx` | one each |

`<main>` replaces `<section>` in every case, which changes no styling:
`cards.css` binds to the `.cards-main` class name and to the rail's sibling
relationship, not to the tag.

**Deliberately without one**, and the reasons differ:

- `app/cards/page.tsx` — a `redirect()`. It renders nothing.
- `app/@modal/**` — the intercepted card dialog. `app/layout.tsx` renders the
  slot *beside* the wrapper, so it is outside the landmark already, which is
  right for a dialog.
- `components/custom/RouteError.tsx` — both consumers are error boundaries
  *inside* `(app)`'s layout, so `AppShell`'s `<main>` already wraps them. A
  second would nest.

**`AppShell`'s `sr-only` `<h1>` stays outside the landmark.** It names the app
rather than the pane, and below 1000px either pane can be the one on screen.

## Alternatives considered

- **Keep one `<main>` in the root layout and move the navigation out of
  `{children}`.** The obvious fix, and it is not available. `cards.css` requires
  `.cards-rail[data-pane="rail"]` and `.cards-main` to be literal siblings in
  that order — `AppShell`'s own docblock and `cardsPageClasses.ts` both say so —
  and the grid they sit in is created by `(app)/layout.tsx`, which is itself
  inside the root layout. There is nowhere to lift the rail to.
- **Reorder `AppShell` so the content pane comes first and put the rail after
  it with CSS `order`.** Breaks the same sibling selector, and the mobile
  pane-swap with it.
- **Leave the root `<main>` and give the content pane a second `tabindex="-1"`
  target with a different id.** Two anchors for one concept, and the landmark
  would still be wrong for a screen reader navigating by region — the skip link
  is the symptom, not the whole problem.
- **Fix only the `(app)` routes.** Cheaper, and it leaves the marketing and door
  screens with a landmark that also contains their `<Navbar>` — measured above
  as the same wrong answer.

## Consequences

- **A route added later can forget its landmark**, and that failure is silent in
  exactly the way this one was. `app/main-landmark.test.ts` is the guard: every
  page route must appear in a hand-written `DRAWN_BY` map, and the file it names
  must contain the element. The map is deliberately not derived — adding an
  entry is the moment somebody decides where that screen's navigation ends.
- The static test cannot see a rendered tree, which is how this bug survived a
  file that genuinely did contain a `<main id="main-content">`. So
  `visual/landmark.ts` asserts the rendered half — exactly one landmark, and no
  `<nav>` inside it — from both screenshot specs, covering ten pages at three
  widths.
- **The guard test got two things wrong about itself before it worked**, and
  both are written into it: prettier breaks a two-attribute `<main>` across
  three lines, so a literal string match silently stops finding it; and
  `app/layout.tsx`'s comment *explaining* the move quotes the element, so a test
  that cannot tell an element from a sentence about one punishes writing the
  sentence.
- **Found on the way, pre-existing, and not fixed here:** `/dashboard` has a
  focusable `<svg tabindex="0" class="recharts-surface">` with no accessible
  name. It is Recharts' own, it is identical on `origin/main`, and it is now the
  first thing the skip link reaches on that route. Its own change.

## Measured

Against a build of `origin/main` in a worktree (ADR-0069's recipe), with a real
session:

- **Zero pixels changed.** All 33 screenshots identical across three widths.
  Moving a landmark should be invisible, and it is.
- **The behaviour is fixed on all four kinds of route.** Navs inside `<main>`
  went 2 → 0 on the signed-in routes and 1 → 0 on the marketing and legal pages.
  After Tab-Enter-Tab, focus now lands on the collection search field, the
  dashboard's first content element, the landing page's first content link and
  the privacy page's first link — instead of `Card Orb home` on every one.
- Exactly one `main#main-content` on all ten pages, at all three widths.
- `app/main-landmark.test.ts` proved to fail without its fix: reverting
  `AppShell` alone turned ten routes red.

## Related

- `STATE.md` — where this was reported and left, under "Two HIGH accessibility
  findings, both small and both real".
- `docs/decisions/0046-loading-fallback-draws-shared-chrome-only.md` — why
  `app/(app)/loading.tsx` may only draw what every signed-in route shares. Its
  landmark is in the same place as `AppShell`'s for exactly that reason.
- `docs/decisions/0012-cascade-layers-fix.md` — why `.cards-main` is a class
  name rather than only utilities, which is what makes the tag swap free.
