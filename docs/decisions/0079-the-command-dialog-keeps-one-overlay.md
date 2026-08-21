---
id: ADR-0079
title: The add-card command dialog keeps one overlay and swaps its contents
status: accepted
date: 2026-08-21
scope: repo
deciders: [Bart, Claude]
superseded-by: null
tags: [untitled-ui, card-add, ux]
---

# The add-card command dialog keeps one overlay and swaps its contents

**Decided, not yet implemented.** ADR-0078 vendored the component and fixed three
faults in it; this record settles the shape before the rewrite, so the next
session does not re-argue it. Written because the choice was delegated
("wat is beste oplossing qua ux enzo?") rather than specified.

## Context and problem statement

FB-0018 asked for a search that reads like Untitled UI, with a reference
screenshot of a command palette: a borderless search field that *is* the header,
a divider, grouped results, and a footer carrying keyboard hints.

`application/command-menus` is that pattern and is now vendored. It is
composable — `CommandDialog`, `CommandMenuList`, `CommandMenuSection`,
`CommandMenuPreview` and `CommandMenuGroup` are all exported — and
`CommandMenuRoot` composes them into a component that **owns its own modal**
(it extends `DialogTriggerProps` and `ModalOverlayProps`).

`CardAddDialog.tsx` is 795 lines and holds three stages inside one `Modal`:

1. quick search (one field, server-side against pokemontcg.io — ADR-0032),
2. "Advanced filters" (explicit Name/Number/Set/Type fields, still a search),
3. the draft form, once a card is chosen: variant, quantity, condition, owned or
   wishlist.

So the question is what happens to stage 3.

## Decision

**Their `CommandDialog` owns the overlay, and the contents swap.** Search and
results first; once a card is chosen, the same dialog shows the draft form.

**The UX argument, which is what decides it.** A command palette is built for
*find and act*: you pick, it closes, the task is done. That model is right when
the selection **completes** the task. Adding a card does not work that way — the
chosen card still needs a variant, a quantity, a condition, and owned-or-wishlist
before anything is saved. The selection is step one of two.

A palette that closes on select therefore drops the person in the middle of the
task: the overlay tears down and a second one builds, focus moves twice, and
going back to try a different card means reopening from scratch. One overlay
whose contents change is the same number of steps with none of that.

**This is still adopting the component, not redesigning it.** The dialog, the
list, the sections, the item rows and the search field are all theirs. What is
not theirs is the decision to keep rendering into the dialog after a selection —
and their own `CommandMenuPreview` shows they anticipate a second pane, so this
is inside the grain of the thing rather than across it.

**"Advanced filters" moves to the footer**, beside where Untitled UI puts the
keyboard hints. It is always reachable, it does not compete with results for the
eye, and it is the slot the reference screenshot already has. It is a fallback
for a search that is hard to phrase (ADR-0032), which is exactly the weight a
footer gives it — present, not prominent.

## Alternatives considered

- **`CommandMenuRoot` as shipped: pick, close, open a second modal for the
  draft.** The most literal reading of "adopt the component as shipped", and the
  standing rule (FB-0013, FB-0015) leans this way. Rejected on the UX argument
  above: two sequential overlays for one task is worse for the person doing it,
  and the standing rule is about not hand-rolling a second design system — it is
  not a rule against using a component for a two-step flow.
- **Compose the parts inside the existing `Modal` and leave `CommandDialog`
  unused.** Keeps one overlay too, but throws away the part of the component that
  handles the overlay, focus and the Escape key — and hand-rolling those is
  precisely what ADR-0066's keyboard-trap findings say this repo is bad at.
  Their dialog is the piece most worth taking.
- **"Advanced filters" as the first row of the results list.** Tempting, and
  rejected: it is not a result, and putting a non-result at the top of a result
  list is how people learn to skip the top of the list.
- **Dropping "Advanced filters" entirely.** ADR-0032 chose it deliberately over
  manual entry, and nothing has changed that.

## Consequences

- The dialog will hold two contents behind one overlay, so the height changes on
  selection. That is a visible movement and nobody has seen it yet.
- **Nothing here is verified visually.** The screenshot harness is deliberately
  off (ADR-0069) and this dialog needs a signed-in session besides, so the
  rewrite lands as `not measured` unless somebody drives a browser with the
  storage state `visual/auth.setup.ts` can mint.
- Until the rewrite happens, `application/command-menus` is vendored with no
  consumer, which ADR-0066 forbids without a written reason. **This record is
  the reason, and it expires when the rewrite lands or when the component is
  removed.** It should not become permanent.
- `command-menu-users.tsx` is a demo with eight hardcoded people and eight remote
  avatar URLs. It is not the piece being adopted and should be deleted as part of
  the rewrite.

## Related

- `docs/feedback/0018-the-add-card-search-does-not-look-vendored.md` — what
  started this.
- `docs/decisions/0078-the-generator-reverts-divergences-silently.md` — the
  vendoring, and the three faults that came with it.
- `docs/decisions/0077-the-search-field-is-the-size-untitled-ui-ships.md` — the
  interim fix, which this supersedes in effect: under a command dialog the field
  is borderless and has no size of its own.
- `docs/decisions/0032-add-card-advanced-filters-not-manual-entry.md` — why
  "Advanced filters" exists and why it is a fallback rather than a mode.
