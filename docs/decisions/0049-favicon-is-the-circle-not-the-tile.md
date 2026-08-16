---
id: ADR-0048
title: The favicon is the circle, not the tile — and the wordmark's orb is optically centred
status: accepted
date: 2026-08-16
scope: repo
deciders: [Bart]
superseded-by: null
amends: ADR-0047
tags: [brand, favicon, icons, wordmark, optical-alignment]
---

# The favicon is the circle, not the tile — and the wordmark's orb is optically centred

Amends **ADR-0047**, which stands except for the favicon half of its "which cut"
section. ADR-0047 is not superseded: the tile is still right for `apple-icon`
and for the manifest, and its reasoning about iOS compositing transparency onto
black is still the reason those two exist. What it got wrong is that it treated
"favicon" and "touch icon" as one case.

## Context and problem statement

Reported plainly: *"dat moet geen vierkant zijn. Dat mag een rondje zijn of zo.
Of een vierkant met rounded corners"* — and, separately, that the orb beside the
name sits wrong because *"er een schaduw onder die orb zit … die schaduw telt
eigenlijk soort van niet mee"*.

Both are correct, and both are the same underlying mistake made twice: treating
the bounding box of a file as if it were the shape of the mark.

### The favicon

ADR-0047 grouped `app/icon.png` with `app/apple-icon.png` and the manifest
entries and gave all four the tiled cut, on the argument that a pale glossy
sphere composited onto an unknown background is a smudge. That argument is
sound — for the surfaces where something *else* does the compositing:

- **iOS home screen** applies its own squircle mask and fills alpha with black.
  It needs an opaque square and will round it itself.
- **Android launchers** composite manifest icons onto a generated background.

A browser tab does neither. A favicon is drawn as given: no mask, no rounding,
no background of its own. So the tile — a square with a flat off-white field —
arrives on screen as a square with a flat off-white field, and next to tabs
whose favicons are shapes, it reads as a sticker rather than a mark.

The transparent cut has no such problem, and it is already the shape that was
asked for: `orb-256.png` is a sphere on transparency, which is a circle.

### The wordmark's orb

`items-center` centres the file, and in `orb-shadow-*` the file is not the ball.
Measured on `orb-shadow-256.png`: the sphere's body runs y 11–214 inside a 256px
box, putting its centre at 112.5 where the box's is at 128. The 40-odd pixels
below are room for the contact shadow to fall into. Centre the box and the ball
rides 15.5/256 of the height high — 1.4px at the 24px display size, which is
small, visible, and reads as a logo that has not quite sat down.

## Decision

### Favicon: the plain cut

`app/icon.png` is `brand/orb-256.png` — the sphere alone, transparent, which is
a circle that fills its box.

Chosen over the two alternatives that were on the table:

- **A rounded square.** `brand/orb-tile.svg` already carries the squircle mask,
  so this was nearly free, and it has the merit of matching the installed app
  icon exactly. Rejected on legibility: a favicon is drawn at 16–32px, and a
  tile spends about 20% of that budget on padding and corner radius, leaving the
  sphere ~11px in a 16px tab. The bare circle fills all 16.
- **The shadowed cut.** Rejected: at 16px a contact shadow is two or three grey
  pixels under the ball, which is mud rather than depth, and it costs the same
  fifth of the box for nothing.

`app/apple-icon.png` and both manifest entries keep the tile, per ADR-0047. The
three intentionally disagree, and it is worth saying why in one line: **the tile
is for anything that will round it off for you; the circle is for anything that
draws it as given.**

### Wordmark: nudge the image, not the box

The `<img>` carries `translate-y-[6.05%]`, which is exactly 15.5/256 — the
measured offset, not a value tuned by eye until it looked right. The shadow now
falls slightly below the text's baseline, which is what a contact shadow is for.

Rejected: **swapping the wordmark to the unshadowed cut**, which would centre
perfectly with no correction at all and is genuinely tempting, since at 24px the
shadow contributes little. Not taken because the shadowed cut was an explicit
request, the shadow does still register against the flat nav bar, and the fix is
one measured number. If the mark ever moves below ~16px in a UI, revisit it — at
that size the shadow really is gone and the plain cut is simply better.

Not needed, but checked so the next person does not have to: **the word wants no
matching correction.** "Card Orb" has no descender, and in Inter the midpoint of
the ink between baseline and cap height lands within a thousandth of an em of the
line box's own centre — so centring the line box does centre the letters. A name
with a descender in it would not be so convenient.

## Consequences

- `/brand` says which cut a browser tab gets and why, in its own section. The
  claim that the tile is for "favicons, touch icons" is gone from that page; it
  was true of one of those and not the other.
- `app/icon.png` is 59 KB against the tile's 100 KB, so this is also cheaper.
- Three icon surfaces now deliberately carry different files. Anything added to
  that set should be classified by the same question — does something else mask
  this? — rather than by copying whichever entry is nearest.
- The 6.05% is tied to `orb-shadow-*`'s framing. Re-running the generator with
  different padding silently invalidates it, and nothing will fail: it would
  drift back to looking slightly wrong. The measurement is in the code comment
  beside the constant so it can be re-taken.
