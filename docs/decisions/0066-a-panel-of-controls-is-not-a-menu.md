---
id: ADR-0066
title: A panel of controls is not a menu, and a vendored component with no consumer is not known to work
status: accepted
date: 2026-08-21
scope: repo
deciders: [Bart]
superseded-by: null
amends: ADR-0062
tags: [ui, design-system, untitled-ui, accessibility, vendoring]
---

# A panel of controls is not a menu, and a vendored component with no consumer is not known to work

Closes the worklist `STATE.md` opened after the audit that asked whether the
landing page's badge was an Untitled UI component and found it was their
*classes*, assembled by hand. Seven components were vendored with no consumer
anywhere in the app. They all have one now, or a reason written down.

## Context and problem statement

The instruction is long-standing and general (FB-0014, FB-0015, FB-0016):
adopt the components, do not adopt the redesign, and stop re-asking per layer.
Asked about the one genuine fork in this batch:

> Volledig omzetten naar Untitled UI's dropdown, gedrag opnieuw opbouwen

*("Convert fully to Untitled UI's dropdown, rebuild the behaviour.")*

That answer was given against a stated cost — no-JS, the hand-rolled
outside-click, the handoff to the mobile sheet. It was **not** given against
what the conversion actually turned up, which is below.

## Decision 1 — the two menus are a popover, not a menu

`MenuDetails.tsx` was a `<details>/<summary>` with a hand-written
`pointerdown` outside-click handler. `FilterMenu` and `ViewMenu` both opened it.

The obvious target was `Dropdown.Root`, and it is the wrong one.
`Dropdown.Root` is React Aria's `MenuTrigger`, which puts `role="menu"` on the
panel — and a menu may contain only menu items. What these two panels contain is
controls: checkboxes, segmented rows, a back button, a scrolling list of several
hundred Pokémon. `role="menu"` around those announces them as menu items and
takes over arrow-key navigation for all of them. That is a worse answer than the
`<details>` it replaces, so "convert fully to their dropdown" is met a different
way.

**`MenuPopover.tsx` is `DialogTrigger` + `Dropdown.Popover` + `Dialog`.** The
popover is Untitled UI's — their radius, ring, shadow and entering/exiting
animation — and what it wraps is a dialog, which is what a panel of controls is.
The one piece of their dropdown left out is the one piece that was about menus.

React Aria brings placement, focus return, Escape and outside-click, none of
which `<details>` gave and one of which was hand-written here.

**Given up deliberately:** `<details>` opens without JavaScript and this does
not. That was already theoretical — both panels are built entirely from
callbacks, so nothing inside either has ever worked without JavaScript. The
element was carrying an affordance its own contents could not use.

**Not given up:** the mobile handoff. Below 640px `onlyWideClassName` is
`display:none` on the menu and the sheet renders instead, so the popover's
trigger is not even focusable there. Untouched.

## Decision 2 — vendored code with no consumer gets fixed when it gets one

`base/file-upload-trigger` had **two faults, each of which would have thrown on
first render**:

- `React.Children.only(...)` in a file that never imports `React`.
- `import { filterDOMProps } from "@react-aria/utils"` — not a dependency of
  this project and not in `node_modules`; `react-aria-components` bundles its
  own copy.

ADR-0062 exempts vendored code from this project's lint and type strictness, and
that exemption is why neither was caught: `@ts-nocheck` hides the first, the
eslint-ignore hides the second, and having no consumer meant nothing ever ran
the file to find out.

**A crash is not formatting, and neither is 62 kB.** ADR-0062's rule — leave
vendored code alone — is about style. It does not extend to a component that
cannot render, nor to one that cannot be used here at an acceptable cost. Both are
fixed in place, with the reason written at each edit. `filterDOMProps` was
removed rather than adding a package for it: it was called on the props left
after the six named ones, and `FileTriggerProps` declares none and extends no
element, so the result was `{}` at every possible call site.

**A third divergence, and this one is measured.** `application/empty-state`
also exports Illustration, FileTypeIcon, AvatarRadius, AvatarRow and
AvatarGrid, and imports `@untitledui/file-icons` (2.5 MB on disk) plus four
illustration sets to do it — at the module's top level, so they ship whether or
not anything renders them. Adopting it for five "no cards yet" sentences put a
460 kB chunk on the client, 62 kB gzipped, holding 1,843 SVG paths. A second,
smaller one behind it: `Header`'s decorative `BackgroundPattern` came through a
barrel over all four patterns, so drawing one shipped the other three — 20.8 kB
gzipped more, almost all `grid-check`.

Measured against a build of `origin/main` in a worktree:

    origin/main                 562.7 kB gzipped client JS
    after adopting EmptyState   655.3 kB   +92.6
    after trimming              595.7 kB   +33.0

The five asset-heavy parts are cut and the pattern is imported directly. The
+33 kB that remains is React Aria's overlay machinery — Popover, Dialog,
Tooltip, ToggleButtonGroup, FileTrigger — buying placement, focus return,
Escape, outside-click and keyboard-reachable tooltips that were hand-written or
absent before, and it is left alone.

The wider lesson is the one to carry: **"vendored and unused" is not a neutral
state.** Twelve components were installed and seven had no consumer; the two
audits before this one counted them as done work. The only thing that
establishes a vendored component works is a consumer.

## Decision 3 — the components that end with no consumer stay, and this says so

`application/tabs`, `application/metrics`, `application/section-headers` and
`application/app-navigation` finish this sweep with nothing importing them.
They are **kept**. `scripts/untitled-add.mjs` re-adds on demand, they cost
nothing in the bundle (nothing imports them, so nothing bundles them), and
`application/tabs` in particular is the right component for a real tablist if
one ever appears — it is only wrong for the four controls in ADR-0065.

Written down so the next audit does not re-open it as a finding.

## What the sweep found on the way

Two live bugs, neither of them migration debt:

- **`.cards-empty` was defined in no stylesheet at all.** It went with
  `cards.css` and the name stayed in the JSX. `SetIndex`, `BrowseSetIndex` and
  `BrowseSetGrid` each carried it alone on a bare `<p>`, so three empty states
  have been rendering as unstyled default paragraphs. `CardsView`'s two sites
  carried their own utilities alongside it and looked right, which is why it
  survived.
- **`.cards-filter-badge` likewise**, so the count of active filters rendered as
  bare text beside the button's label. `.cards-filter-trigger` on the same
  button was dead outright.

Both were fixed by the adoption itself: `application/empty-state` and
`base/badges` are what those classes were standing in for.

**`EmptyState` is used three parts deep, not eleven.** `EmptyState.Content`
renders a `<main>` and `EmptyState.Title` an `<h1>`, and `app/layout.tsx`
already has one of each; a document may hold one of each. Root carries the
centring and the width cap, Header the icon, Description the sentence.

**One `title=` stays a `title=`.** `CardItem`'s price hint is not keyboard
reachable and is not converted, because a Tooltip needs a focusable trigger and
that span renders once per card — 1,610 of them on `/collection`. Sixteen
hundred new tab stops in a grid, in front of what the card's own dialog already
says, is worse for the keyboard rather than better.

**A residue of dead class names remains, and is recorded rather than swept.**
About sixteen legacy hook names — `cards-head-title`, `cards-set-meta`,
`view-menu-panel`, `cards-view-trigger` and the like — are written onto elements
and read by nothing: no CSS rule, no `[&_.x]` variant, no `querySelector`. Every
one of them sits on an element that carries real Tailwind utilities as well, so
none is a third `.cards-empty`; they are harmless. They are also exactly the
camouflage that let the two real ones go unnoticed, so the rule worth keeping is
that a literal class name in this codebase should be defined in CSS, read by a
variant, or deleted. Removing them is its own change, not a tail on this one.

## Consequences

- `MenuDetails.tsx` and `filterMenuBadgeClassName` are deleted; `MenuPopover.tsx`
  replaces them.
- **A documented blind spot in the screenshot harness closes.**
  `visual/owner.spec.ts` said the filter rows were "converted but
  unphotographed" because neither menu "would open reliably from a click". Both
  are a real `<button>` opening a real `role="dialog"` now, so both open by
  accessible name and the filter panel has a baseline for the first time.
- `visual/upload-owner.spec.ts` is added: the one thing in that directory that
  is not a screenshot. A picture of an upload button proves nothing about it,
  and this component had two crash bugs and no coverage.
- `SettingsSwitch` uses `ToggleBase` and keeps its native `<input
  type="checkbox">`, so the form-post semantics and the checkbox role survive —
  `Toggle` is a React Aria Switch and would have replaced the mechanism.
- Every text field in the app is `InputBase`. The three reasons previously given
  for hand-copying the recipe — no ref, owns its width, no `list` prop — are all
  true of `Input`/`TextField` and none is true of `InputBase`, the layer below
  both. ADR-0059's deferred datalist-versus-Combobox decision is untouched:
  `InputBase` passes `list` straight through.
