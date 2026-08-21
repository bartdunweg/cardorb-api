---
id: ADR-0090
title: Delete the five colour tokens that painted nothing, and keep their measurements here
status: accepted
date: 2026-08-22
scope: repo
deciders: [Bart, Claude]
superseded-by: null
tags: [untitled-ui, tokens, colour, accessibility, testing]
---

# Delete the five colour tokens that painted nothing, and keep their measurements here

## Context and problem statement

ADR-0089 added `lib/design/token-surfaces.test.ts`, which asserts that every
Card Orb colour token is painted somewhere. It reported five that were not:
`labelQuaternary`, `glass`, `tint`, `tintLabel` and `danger` — no `var(--color-…)`,
no utility class, no `colour.…` reference outside `tokens.ts` and `/brand`.

ADR-0089 recorded the list and left the decision open, because deleting them
costs something real: each carries a measured contrast argument, several of them
recording a value that was *tried and rejected*, and this repository treats a
written rejection as the thing that stops a bug being reintroduced.

Two of the five were worse than merely unused:

- **`glass`** was still in the `surfaces` fixture, so the AA sweep in
  `tokens.test.ts` measured every text tier against "the glass card" — a surface
  no component has rendered since ADR-0061 removed glass. A stricter floor than
  reality, and a test of nothing. That is the dangerous kind: it makes a
  regression look like it was already covered.
- **`tint`/`tintLabel`** were the subject of a whole `describe` block that has
  been asserting facts about the app's accent since the accent stopped being
  blue.

## Decision

**Delete all five, and move the measurements into this record.** The values are
recoverable from git; the reasoning is what has to survive somewhere a reader
will look, and a comment beside a deleted value is not that place.

`glassSolid` stays — Modal.tsx's `bg-glass-solid` is a live consumer, and it
keeps the "control glass" surface the dark `#878787` rejection is measured on.

### The measurements, kept

**`labelQuaternary` — `#949494` light / `#676767` dark.** A backdrop carrying
information without being text: the set logos behind their own cards. WCAG asks
3:1 of such a graphic *and no more* — raise it and it stops receding and starts
competing with the content in front of it.

- Measured **2.98:1 in both themes** on the glass card.
- The floor in the test was deliberately **2.9, not 3**, with the reason
  attached: `#7a7a7a` measured **3.83** and "the logos sat forward of the work
  they are meant to sit behind."
- Rejected: **`#b0b0b0` at 2.3:1**, under the graphic floor.
- A stale claim was found here by testing rather than by argument: the light
  block of the old tokens.css said "3.1:1 and still reads as a backdrop" while
  the dark block said "2.98 here and 2.98 in light". The test measured 2.98, so
  the dark comment was right and the light one had been wrong for as long as
  both existed.

**`glass` — `rgba(254, 254, 254, 0.78)` / `rgba(37, 37, 40, 0.38)`.** The
translucent card fill before compositing. Stored raw rather than as the result,
because the result depends on what is behind it and the tests did that
arithmetic themselves.

**`tint` — `#007aff`, both themes.** iOS system blue. Same value in light and
dark on purpose: the one colour that should not shift when the lights go out,
because it alone carried "this is the thing you chose". Clears 3:1 as a graphic.
**Fails AA as text: 4.02:1 on white, 3.87:1 on the page.**

**`tintLabel` — `#0066cc` / `#007aff`.** The accent as a word. Split off from
the fill precisely because the fill fails AA as text and nothing in the codebase
said so. The darkened value clears 4.5 on both light surfaces; dark mode's
system blue was already past the floor, so it stayed.

**`danger` — `#d7263d`, both themes.** Destructive actions — the delete-account
panel. Same in both themes for tint's reason: a colour meaning "this is
destructive" should not soften in the dark. Destructive UI reads Untitled UI's
error tokens now.

### The rule that outlives all of them

> **A colour cleared as a graphic (3:1) is not cleared for use under a word
> (4.5:1).**

This is why `tint` and `tintLabel` were ever two tokens, and ignoring it put a
4.02:1 button on screen once (ADR-0058). It is not a fact about blue, so it is
kept — and **pointed at the colour that carries it now**. `tokens.test.ts`
measures white on `bg-brand-solid`, the live accent since ADR-0061, read from the
generated stylesheet rather than hard-coded so a change to the brand ramp is
measured rather than assumed.

Measured: `--color-brand-600` is `rgb(127 86 217)`, and **white on it is
4.96:1** — over AA with room, not on a knife edge.

## A parser bug the replacement test found

Writing that test surfaced a real defect in `lib/design/contrast.ts`. `parse()`
split `rgb(...)` arguments on `[,/]` only, so the modern space-separated syntax —
`rgb(127 86 217)`, which is exactly how Untitled UI writes the brand ramp in the
generated stylesheet — parsed to `NaN` and every ratio against it came back
`NaN`.

It surfaced here because `expect(NaN).toBeGreaterThanOrEqual(4.5)` fails. **A
caller asserting the other way round — `toBeLessThan` — would have got a silent
pass**, which is how a rejection test could have gone green while measuring
nothing. `parse()` splits on whitespace too now.

## Consequences

- The token count drops from 57 to 52 generated custom properties.
- `surfaces` has three entries per theme, not four. Every text tier is now
  measured only against surfaces something actually draws.
- `app/brand/page.tsx` loses its "Tint" swatch.
- `token-surfaces.test.ts`'s `KNOWN_UNPAINTED` is **empty**, and that is the
  point: it is deliberately not an allow-list keyed by name, because a list with
  entries is a list people add to, while a list that must stay empty is one they
  have to argue with. A token that genuinely has to outlive its consumers can go
  back in it — visibly, in a diff, with a reason.
- 528 tests → 516. Twelve of those were the dead measurements; none of the
  removed assertions covered live code.

## Also fixed here: `--fs-label`

`tokens.ts` and `Wordmark.tsx` both claimed `--fs-label` "stays in tokens.css
unpromoted". `tokens.css` does not exist and the variable is declared nowhere;
`Wordmark.tsx` writes its clamp literally. Both comments now say so.

The reason it was never promoted is kept, because it is a live trap rather than
a fact about one variable: it would have to be `--text-label`, and
`--color-label` already owns the `text-label` class. Tailwind resolves one of the
two and says nothing — the same silent-collision shape as ADR-0012 and the
`rounded-lg` collision in ADR-0056. Check for it before promoting any step into
`@theme`.
