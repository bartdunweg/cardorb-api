---
id: ADR-0077
title: The add-a-card search field is the size Untitled UI ships, not a louder one
status: accepted
date: 2026-08-21
scope: repo
deciders: [Bart, Claude]
superseded-by: null
tags: [design-system, untitled-ui, card-add]
---

# The add-a-card search field is the size Untitled UI ships, not a louder one

## Context and problem statement

Looking at the "Add a card" dialog after PR #106 merged:

> deze search ziet er niet uit als een untitled component?
> *("this search doesn't look like an Untitled component?")* — FB-0018

The observation was right, and the reason is a good one to record: **the field
was the vendored component all along.** `components/base/input`'s `InputBase`,
adopted in ADR-0065. What made it not look like one was four overrides that
pushed it into a shape Untitled UI's scale does not contain.

| | Untitled UI `lg` | What shipped |
| --- | --- | --- |
| Text | `text-md` = 16px | `text-display-xs` = 24px |
| Weight | normal | `font-bold` |
| Height | ~44px | `h-14` = 56px |
| Radius | `rounded-lg` | `rounded-2xl` |

The intent was written down in place, which is why this is a decision to
supersede rather than drift to clean up:

> The one big field this dialog opens on — taller and louder than the rest. …
> Their `lg` is as big as their scale goes and it is smaller than both, so the
> emphasis has to be said here or lost.

**A defect sat underneath the taste question.** `inputClassName` styles the
`<input>` element, not the placeholder, so `text-display-xs font-bold` applied to
whatever somebody *typed*. A card name entered at 24px bold is not a design
choice anybody made; it is a consequence nobody looked at. It is visible in the
screenshot that prompted the feedback — the caret is as tall as the placeholder.

## Decision

**The field is `size="lg"` and nothing else.** Every styling override is gone.

The standing rule decides it. FB-0013 and FB-0015 set it plainly: Untitled UI
wins unless the product identity (ADR-0061 — the holo effect, the orb) or a
measurement earns the exception. **Wanting emphasis is neither.** The original
reasoning is not wrong about the goal — this dialog opens on one field and
nothing else, so something has to carry the screen — but overriding four
properties of a vendored component is the way the rule rules out, and the
dialog's own heading is already there to do it.

Two class names survive, and both are function rather than size:

- `pr-11` — room for the clear button, which is absolutely positioned outside
  `InputBase` because their trailing slot is for a tooltip or the invalid icon,
  not an action. Without it the X sits on the text. Checked: the button occupies
  12–40px from the right edge, and 44px of padding clears it.
- `[&::-webkit-search-cancel-button]:hidden` — `type="search"` gives WebKit its
  own native clear button, which would sit beside ours doing the same job.

**The placeholder text and the absence of a visible label are unchanged, on
instruction.** Both were raised: "Search for a card" is the third thing on screen
saying *search* after the heading and the magnifier, and what the field actually
accepts (name, number, set, type) is stated only in the `aria-label`, so a
sighted user never learns it. Bart's answer was to keep the wording and to let
the dialog heading be the field's context. Recorded because it was asked and
settled, not because it is being reopened.

## Alternatives considered

- **Keep the 56px height, drop only the 24px bold text.** Would have fixed the
  defect and left the emphasis. Rejected: `h-14` is still a height their scale
  does not have, so the field would still not be one of their sizes — the exact
  thing the feedback was about.
- **Move the emphasis to the dialog heading and keep a normal field.** Untitled
  UI's own answer to "this screen is one field". Not taken as part of this change
  because nobody has said the heading is too quiet; if that turns out to be true,
  it is a separate, smaller change than re-inflating the input.
- **Record the exception and keep it.** Available, and the honest option if the
  emphasis were load-bearing. It is not: nothing measured says the field was hard
  to find, and the standing rule exists precisely so that "it looked better to me"
  does not accumulate into a second design system.

## Consequences

- The field now renders exactly as the vendored component ships, so there is no
  custom value left to measure or to drift. That is the point: **this change
  removes a thing to verify rather than adding one.**
- Typed text is 16px at normal weight, like every other input in the app.
- **Not measured.** No screenshot was taken. The screenshot harness is
  deliberately off this session (ADR-0069 — the baselines are gitignored, so it
  compares a build against pictures of itself), and this dialog needs a signed-in
  session besides. The claim rests on reading the vendored component's own size
  map, not on seeing it.
- `cardAddSearchInputClassName` still exists, now holding two functional classes.
  It could be inlined; it is kept named so the two reasons stay documented where
  the next person will look.

## Related

- Feedback: [FB-0018](../feedback/0018-the-add-card-search-does-not-look-vendored.md)
  — what was said, and the two things it turned out to be.
- Feedback: [FB-0013](../feedback/0013-when-in-doubt-follow-untitled-ui.md),
  [FB-0015](../feedback/0015-adopt-the-components-not-the-redesign.md) — the
  standing rule this is decided by.
- `docs/decisions/0065-a-selected-segment-has-to-be-visible.md` — the input
  adoption, and the shape of an exception that *is* earned (a contrast
  measurement).
- `docs/decisions/0032-add-card-advanced-filters-not-manual-entry.md` — why this
  dialog opens on one search bar at all.
