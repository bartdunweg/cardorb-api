---
id: ADR-0058
title: The three suggesting fields stay native until Combobox is chosen deliberately
status: accepted
date: 2026-08-19
scope: repo
deciders: [Bart]
superseded-by: null
tags: [untitled-ui, forms, combobox, accessibility]
---

# The three suggesting fields stay native until Combobox is chosen deliberately

`CardAddDialog`'s **Set**, **Type** and **Generation** fields are still native
`<input list=…>` with a `<datalist>`, while **Name**, **Number** and the submit
button beside them are Untitled UI's. That inconsistency is deliberate and this
records why, because it will otherwise read as an oversight.

## Context and problem statement

Untitled UI's `Input` has no `list` prop. Its props are
`AriaTextFieldProps` plus a `Pick` of a handful more, and `list` is in neither.
The three fields use it for a real feature: they suggest the sets, types and
generations the catalogue already knows about, from `fields?.sets` and friends.

Untitled UI's answer to "a field that suggests" is `Combobox`, which is a
different control, not a styled version of the same one:

- A `<datalist>` is a hint. The field is a plain text input, the browser draws
  the suggestions in its own chrome, and typing something not on the list is
  ordinary.
- A `Combobox` is an ARIA combobox with a listbox and managed focus. Free text
  needs `allowsCustomValue`, and the list is rendered by the app rather than by
  the browser — which is a real accessibility gain and a real behaviour change,
  including on mobile, where the native datalist UI is what people know.

## Decision

Convert what converts cleanly; leave these three alone; write this down.

Swapping them is the right end state — it is more accessible and it is what
"follow Untitled UI" means (ADR-0055). It is **not** a change to make in the
last ten minutes of a sweep, in the dialog ADR-0020 is about, whose inputs have
already silently lost their styling once on a route that needs a signed-in
session to look at.

## Alternatives considered

- **Do the Combobox swap now.** Rejected on timing, not on merit. Three fields,
  three suggestion sources, `allowsCustomValue` on each, and a control that
  cannot be photographed by the public screenshot project — that is its own
  pass, with `owner.spec.ts` opening the dialog for evidence.
- **Drop the suggestions and use Untitled UI's plain Input.** Rejected: it is a
  feature, and losing it to make a sweep look tidy is the wrong trade.
- **Add `list` to the vendored `Input`'s props.** Rejected: a fourth patch in
  `scripts/untitled-add.mjs`, and ADR-0057 already says three is the point where
  that list stops being maintenance and starts being a signal.

## Consequences

- One dialog currently mixes two field styles. Visible, and the code says why at
  the point where somebody would otherwise "fix" it.
- **The next step is a decision, not a chore:** adopt `Combobox` with
  `allowsCustomValue` for all three, or keep the native datalist permanently and
  accept the mix. Either is defensible; drifting is not.
- `/settings/password` is in the same shape for a different reason: converted,
  but not photographed, because it needs a recovery session. Named here so it is
  not discovered later.

## Confirmation

`./scripts/verify.sh` exits 0 — 478 tests in 41 files. Eighteen screenshots
across six public pages at three widths all pass; nothing public moved.
`CardAddDialog` and `Onboarding` are both behind a login and were not
photographed in this pass, which is exactly the gap `owner.spec.ts` exists to
close and the next thing to run.

## Related

- ADR-0055 — Untitled UI is the default, which is why this is a "not yet".
- ADR-0057 — the three-patch limit this declines to add a fourth to.
- ADR-0020 — this dialog losing its input styling silently, once before.
