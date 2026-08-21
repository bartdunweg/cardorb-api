---
id: ADR-0080
title: The add-card results are one column with a card thumbnail per row
status: accepted
date: 2026-08-21
scope: repo
deciders: [Bart, Claude]
superseded-by: null
tags: [untitled-ui, card-add, ux]
---

# The add-card results are one column with a card thumbnail per row

**Decided, not yet implemented.** The third and last shape question for the
command-dialog rewrite (ADR-0079). Recorded now because it was reached by doing
the work, and losing it means re-deriving it.

## Context and problem statement

The results in `CardAddDialog` are a **grid of card scans** — three columns, four
above 480px — because a Pokémon card is a picture and people recognise the
picture before they read the name.

A command menu is a **list of text rows**. Its item type
(`CommandDropdownMenuItemProps`) offers `icon`, `avatar` and `dot`; the avatar is
a small round `<Avatar>`, not a 245:342 portrait scan.

So adopting `CommandMenuList` as shipped means trading the card art for text.
That is not a detail in a card-collection app, and it is not what FB-0018 asked
for — that asked for a search field that reads like Untitled UI.

The trade, stated plainly:

| | Their list, as shipped | The grid as it is today |
| --- | --- | --- |
| Recognising a card | name and set as text | you see the card |
| Keyboard | arrows and enter come free with `AriaListBox` | would have to be hand-written |
| Untitled UI | as shipped | our own thing wearing their styling |

The keyboard half matters more than it first looks. The footer in the reference
screenshot advertises *↑↓ to navigate, ↵ to select* — and that behaviour lives in
exactly the part a custom grid would replace. ADR-0066 found two keyboard faults
in hand-rolled overlay code in this repo; hand-rolling roving focus over a grid
is the same bet again.

## Decision

**One column. Each row is a list item carrying a card thumbnail, the name, and
the set and number.**

`CommandDropdownMenuItem` renders `children` in place of its label when children
are given, so the row content is ours while the item, the list, the selection and
the keyboard behaviour stay theirs. No vendored file is modified — this is the
component's own extension point, not a patch, so ADR-0062 is untouched.

It resolves the trade instead of picking a side: the scan is still there, at row
height rather than tile height, and arrow-key navigation comes from
`AriaListBox` as shipped.

## Alternatives considered

- **Their list as shipped, text only.** Most literal adoption, and rejected: a
  collection app that will not show you the card is answering a different
  question than the one being asked.
- **Keep the multi-column grid inside their dialog and footer.** Keeps the art
  and the look, and loses the keyboard behaviour the footer would then be
  advertising. Writing roving focus over a responsive grid by hand is precisely
  the class of thing this repo has got wrong before.
- **`type: "avatar"` with the scan as the avatar.** Free, and wrong: `Avatar`
  crops to a square, and a Pokémon card cropped square is unrecognisable.

## Consequences

- One column means more scrolling than a four-column grid for the same number of
  results. Acceptable: a search that returns the right card in the first few rows
  is the normal case, and "Show more results" already exists for the rest.
- Row height is set by the thumbnail. `CommandDropdownMenuItem`'s row is
  `min-h-10` (40px); a 245:342 scan at that height is about 29px wide, which is
  small. **The right thumbnail height is not decided and should be settled by
  looking at it**, not in this record.
- **Not measured, and cannot be this session.** The screenshot harness is off by
  instruction (ADR-0069) and this dialog needs a signed-in session. Whoever
  implements it should drive a browser with the storage state
  `visual/auth.setup.ts` can mint, because every claim about whether this reads
  well is a claim about pixels.

## Related

- `docs/decisions/0079-the-command-dialog-keeps-one-overlay.md` — the overlay
  decision this completes.
- `docs/decisions/0078-the-generator-reverts-divergences-silently.md` — the
  vendoring, and the three faults that came with it.
- `docs/decisions/0066-a-panel-of-controls-is-not-a-menu.md` — the hand-rolled
  keyboard faults that make the free-keyboard argument the deciding one.
- `docs/feedback/0018-the-add-card-search-does-not-look-vendored.md`.
