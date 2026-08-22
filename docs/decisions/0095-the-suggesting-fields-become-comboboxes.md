---
id: ADR-0095
title: The suggesting fields become Untitled UI Comboboxes, and ui:add is repaired
status: accepted
date: 2026-08-22
scope: repo
deciders: [Bart]
superseded-by: null
tags: [untitled-ui, combobox, forms, accessibility, tooling, adr-0059]
---

# The suggesting fields become Untitled UI Comboboxes, and `ui:add` is repaired

**Supersedes ADR-0059**, which deferred exactly this and said so: *"Swapping them
is the right end state — it is more accessible and it is what 'follow Untitled
UI' means (ADR-0056)."* It was turned down on timing, not on merit, and it named
what the pass would need: `allowsCustomValue` on each field, and evidence from
the dialog opened in a signed-in session.

## Context and problem statement

Bart asked what else could be optimised, then narrowed it: *"door untitled meer
te gebruiken bedoel ik."*

Auditing for that found less than the question implies, which is the first
finding worth recording. ADR-0056 has been applied consistently enough that the
hand-written components left are mostly things Untitled UI does not ship:

- **There is no generic Modal primitive in `base/`.** Untitled UI's 36 modals
  are composed dialogs — `image-crop-modal`, `plan-01-modal`. Our 403-line
  `Modal.tsx` is not a reimplementation of an Untitled UI component; replacing
  it would mean going to `react-aria-components` directly, which is a different
  argument.
- The hand-drawn set-completion bar is a **deliberate** a11y decision, written
  in place: `<progress>` announces itself as a live task.
- `Segmented`, `MenuPopover` and `Button` already wrap `button-group`,
  `dropdown` and `buttons`.

What was genuinely waiting was the one ADR-0059 had parked.

## Decision

`CardAddDialog`'s **Set** and **Type** filters are Untitled UI's `ComboBox`.
(ADR-0059 said three fields; Generation stopped being typed by hand under
ADR-0081, so there were two left.)

`allowsCustomValue` is what makes the swap possible at all. A `<datalist>` is a
hint — the field is a plain text input and typing something off the list is
ordinary. Without that prop a ComboBox clears what does not match, which would
silently break adding a card from a set the catalogue has not indexed yet.

**The leading search icon stays**, even though Name and Number do not have one.
It is Untitled UI's own answer for a suggesting field, and turning it off needs
a patch to the vendored component — a sixth entry on a list ADR-0058 said should
have stopped at three. ADR-0056: where it is even, take Untitled UI's and note
it. It is arguably informative rather than merely different: it marks which
fields suggest.

## Consequences

**The `src/` move had broken `npm run ui:add` in six ways, all silent.** The
wrapper exists to put back what the generator breaks every time, and its list
grew from three to six:

1. It writes to `src/src/components/base/base/<family>/` — `--path` is taken as
   a project root and its own category folders are appended underneath.
2. It writes imports as `@/src/components/base/base/…`. `@/` is `./src/` now, so
   those resolve to nothing — and the symptom is not "module not found" on the
   import line. It is a props interface silently becoming an error type, and
   half a dozen *"Property 'label' does not exist"* errors fifty lines later.
   The depth is not even consistent: one file in the same run was written
   `@/src/components/base/avatar/avatar`, with one `base` rather than two.
3. It imports from `@untitledui/icons`, the free package, beside the PRO one
   this project has (ADR-0067, ADR-0083).
4. It adds that package to `package.json` — and rewriting the imports alone
   leaves the dependency behind, which is worse than either state: nothing
   imports it, nothing fails, and the next reader finds two icon sets and no
   reason.
5. **It overwrites `src/utils/cx.ts` with its stock version.** Nothing fails.
   `cx` simply stops knowing the radius scale, so `cx("rounded-lg",
   "rounded-orb-sm")` returns both again — the exact bug that file's docstring
   exists to describe. Restored from git, and only when the file was clean
   before the run.
6. It may write a vendored hook into `src/hooks/`, which is mixed on purpose and
   whose exemptions are per-file. Reported rather than automated: only a person
   can say which of the two kinds a new hook is. This is assumption A5 in
   `MIGRATION.md`, and it fired on the first run — `use-resize-observer.ts`.

Also: the CLI installs a whole family. `select` brought eight files for a
combobox that needs four. The four kept are `combobox`, `popover`,
`select-shared` and `select-item` — and `select-item` is the trap, because the
dependency closure that matters is the *consumer's*, not the component's. It is
imported by nothing in `combobox.tsx` and is what renders its options.

## Alternatives considered

**Replace `Modal.tsx` with react-aria-components' `ModalOverlay`/`Dialog`.**
Not rejected, but out of scope here: it is not "use Untitled UI more", it is a
different dependency argument, and `Modal.tsx`'s comments document real
scroll-lock and focus-trap behaviour that would have to be re-proved.

**Patch the vendored ComboBox to drop the icon.** Rejected, see above.

**Keep the `<datalist>`.** Rejected by ADR-0059's own reasoning, now that the
timing objection is gone.

## Confirmation

The evidence ADR-0059 asked for, in a signed-in browser with the dialog open:

- The listbox opens on focus with **53 sets** from the catalogue, and the input
  reports `role="combobox"`, `aria-expanded="true"` — a real ARIA combobox
  rather than browser chrome.
- Typing `"Een set die niet bestaat"` and tabbing away **keeps the value**.
  That is `allowsCustomValue` proved rather than assumed, and it is the one
  behaviour whose loss would have been a regression rather than a change.
- The fields wear the same surface as Name and Number.

The wrapper was tested by reproducing the generator's damage — a file in
`src/src/`, an `import React`, a free-icons import, an `@/src/…` path, and an
overwritten `cx.ts` — and running it. All five were repaired and reported; the
sixth removed the dependency and said to run `npm install`.

`./scripts/verify.sh`: secrets, format, tokens, typecheck, 452 tests, lint and
build all pass.

One console error appears when searching for a set that does not exist: a 502
from `/api/v1/catalog/search`. That is the upstream-failure path ADR-0033 is
about, not a fault in this change.
