---
id: FB-0018
date: 2026-08-21
source: Bart
source-type: stakeholder
severity: 2
sentiment: negative
status: open
tags: [design-system, untitled-ui, card-add]
---

# The add-a-card dialog's search field does not read as an Untitled UI component

## What was said

> deze search ziet er niet uit als een untitled component?

English: *"this search doesn't look like an Untitled component?"*

Sent with a screenshot of the "Add a card" dialog in dark mode: a very tall
rounded field with a magnifier on the left and the placeholder "Search for a
card" set large and bold, and a purple focus ring around it.

## Context

`components/custom/CardAddDialog.tsx`, the field the dialog opens on. Raised
while reviewing the app after the quality sweep merged as PR #106.

The observation is correct, and the code says so itself. The field **is** the
vendored component — `InputBase` from `components/base/input` — but it is
overridden into a shape Untitled UI's scale does not contain:

- `h-14` (56px) where their largest size, `lg`, is about 44px.
- `text-display-xs` (24px) where their `lg` is `text-md` (16px).
- `font-bold`, which the interface review found is used nowhere else in this
  app.
- `wrapperClassName="rounded-2xl"` where their input is `rounded-lg`.

The docblock above `cardAddSearchInputClassName` states the intent plainly:

> The one big field this dialog opens on — taller and louder than the rest. …
> it is 56px rather than 40, and it is set at `text-display-xs`. Their `lg` is
> as big as their scale goes and it is smaller than both, so the emphasis has
> to be said here or lost.

So this was a deliberate choice, recorded in place, not drift.

## Interpretation

Two separate things, and they should not be conflated:

1. **The standing rule says this exception is not earned.** FB-0013 through
   FB-0016 set it: Untitled UI wins unless the product identity (ADR-0061 — the
   holo effect, the orb) or a contrast measurement justifies an exception.
   "Louder" is neither. Wanting emphasis is a real design goal; overriding four
   properties of a vendored component is not the only way to reach it, and it is
   the way the standing rule rules out.

2. **There is a defect underneath the taste question.** `inputClassName` styles
   the `<input>` itself, so `text-display-xs font-bold` applies to the text
   somebody *types*, not only to the placeholder. A card name entered at 24px
   bold is not what anyone asked for, and a 24px placeholder reads as a heading
   rather than as a field — which is likely what prompted the reaction. This
   part is worth fixing whatever is decided about the size.

A hypothesis, not a fact: the emphasis was wanted because this dialog opens on
one field and nothing else, so the field had to carry the screen. Untitled UI's
own answer to that is a larger *dialog* heading and a normal input, not an
oversized input.

## Action

- [ ] Decide the size question with the standing rule in mind: adopt `lg` as
      shipped, or argue the exception explicitly and record it.
- [ ] Either way, stop applying `text-display-xs font-bold` to typed input.
- [ ] Check the same override is not repeated on the other three inputs in this
      dialog.

## Related

- Feedback: [FB-0013](0013-when-in-doubt-follow-untitled-ui.md),
  [FB-0015](0015-adopt-the-components-not-the-redesign.md) — the standing rule
  this measures against.
- Decision: ADR-0065 (the input adoption), ADR-0032 (why this dialog opens on
  one search bar at all).
