---
id: ADR-0086
title: The tilt is armed after its module lands, not before
status: accepted
date: 2026-08-22
scope: repo
deciders: [Bart]
superseded-by: null
tags: [cards, performance, interface]
---

# The tilt is armed after its module lands, not before

## Context and problem statement

Pointing at a card in the collection made it flash: the picture went for a moment,
and only then did the tilt start. Once per card, on its first hover.

`CardItem`'s `arm()` did two things in one breath — `import("hover-tilt/web-component")`
and `setTilted(true)` on the next line, the import not awaited. So React put
`<hover-tilt>` in the document while `customElements.define` had not run yet.
Measured on a 6-column grid, the element sat undefined for **36–47 ms**: no shadow
root, no slot, none of its own stylesheets, and the children re-laid out again when
the upgrade finally arrived. Two disturbances where there should be one.

The switch also remounts the `<img>` — React cannot move an element deeper into the
tree, so the old one is destroyed and a new one built — and the new one carried
`loading="lazy" decoding="async"`, both of which tell the browser it is free to
paint the element before it has a picture in it.

## Considered options

1. **Await the import, and let the second mount paint immediately.** One `.then`,
   plus `eager`/`sync` on the copy that only exists because a pointer is on it.
2. **Mount `<hover-tilt>` on every card so nothing ever remounts.** Removes the swap
   entirely.
3. **Draw the old picture over the new one until it has loaded.** Guarantees a
   painted frame, at the cost of a second element and a piece of state per card.

## Decision

We will do option 1. `arm()` awaits the module and only then flips the state, guarded
by a ref because `pointerenter` fires again before state comes back.

Chosen because the undefined window is the part that was measured, and it is the part
that is free to remove. Option 2 is what the docblock on `CardItem` already rejects
for a good reason — 1,622 custom elements, each asking the compositor for a permanent
layer. Option 3 is real, and it stays on the shelf: it is what to reach for if the
flash is still visible to a human eye after this, since a compositor layer is created
on upgrade whatever we do, and that costs a frame no attribute can give back.

## Consequences

- Good, because the element arrives already upgraded — confirmed by measurement, the
  36–47 ms window is now 0.
- Good, because the remount was found to lose `data-retried`, so a card that had
  recovered from a 404 went straight back to the URL that 404s the moment you pointed
  at it. The retry is state now, and the src it picks survives the swap.
- Bad, because the very first card hovered in a session now waits for the chunk before
  it tilts, instead of tilting into an element that is not there yet. It is the same
  wait, honestly placed.
- Neutral, because nothing about the effect itself changed. ADR-0061 protects the holo
  and the hover; this is the transition into them.

## Confirmation

A `MutationObserver` on `.cards-scan` reading `customElements.get("hover-tilt")` and
`shadowRoot` at the moment `<hover-tilt>` is inserted. Before: `false`/`false`, upgraded
36–47 ms later. After: `true`/`true`, and the image reports `complete`, `eager`, `sync`.
The eye is the other instrument, and the one that reported this in the first place.

## Related

- Protects: ADR-0061 (only the card effects are protected)
- Code: `components/custom/CardItem.tsx`, `components/custom/TiltScan.tsx`
