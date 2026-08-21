---
id: ADR-0089
title: One canvas for the whole app, and two tokens that stopped naming their own surfaces
status: accepted
date: 2026-08-22
scope: repo
deciders: [Bart, Claude]
superseded-by: null
tags: [untitled-ui, tokens, colour, theme-color]
---

# One canvas for the whole app, and two tokens that stopped naming their own surfaces

## Context and problem statement

Bart noticed the landing page background, the navbar and the cards look like
different colours, and asked why, and whether they could be brought in line.

The first half of the answer is that they were not three colours. The navbar and
the cards are both `bg-primary` and have been since ADR-0061 handed the palette
to Untitled UI. What reads as a difference is those two against the page, which
is `bg-secondary` — and that two-tier read is the system working, not drifting.

The second half is that three other things had drifted, and each one was
invisible from the place it broke:

1. **The signed-in half of the app stood on the card colour.**
   `pageCardsClassName` painted its canvas `bg-primary` while `app/layout.tsx`
   painted html and body `bg-secondary`. Same app, two canvases. Worse, every
   raised thing inside that shell — the rail, the set panels, the grid hover
   pill — is itself `bg-primary`, so they were the same colour as the surface
   they were supposed to stand on and read only by their ring and shadow.

2. **The tab-bar scrim faded to a colour nothing was painted.** It read
   `--color-bg-grouped` (`#181818` in dark) over a `#0a0a0a` canvas. A scrim
   that ends in a different colour from the page ends in a band. On every
   dark-mode phone.

3. **The browser chrome was tinted from the wrong colour.**
   `colour.bgGrouped` is documented in `lib/design/tokens.ts` as *"The page.
   Painted on body, and what the browser chrome is tinted from"*, and it said
   `#ffffff` / `#181818`. That was true when ADR-0024 made the light page white.
   It stopped being true in `b1d574a`, when the Untitled UI adoption moved html
   and body to `bg-secondary`. `viewport.themeColor` and the web manifest both
   read that token, so Safari painted the rubber-band bands above and below the
   page a shade off the page they framed — which is the exact seam the comment
   sitting on `viewport.themeColor` warns about. The warning was there; the
   value it guarded had moved out from under it.

The common cause of all three is the same: `bgGrouped` and `bgSurface` are
*named* after surfaces ("the page", "a card") but stopped being *pointed* at
them, and nothing checks that a token still describes what it claims to.

## Considered options

**A. Flatten to one colour everywhere.** Page, navbar and cards all
`bg-primary`; raised surfaces read by border and shadow alone. This is what
ADR-0024 asked for in August ("de pagina niet grijs maar wit, standaard bg van
hele tool moet wit") and what the signed-in shell was already doing.

**B. Keep the layering, make it consistent.** Page `#fafafa`/`#171717`
everywhere; anything raised `#ffffff`/`#0a0a0a`. This is Untitled UI's own
system, which ADR-0056 and ADR-0061 already made the tie-break.

**C. Fix only the scrim.** Leave the two canvases as they are.

## Decision

**B, applied everywhere at once** — Bart's choice, asked before any code moved.

- `pageCardsClassName` (`components/custom/cardsPageClasses.ts`) paints
  `bg-secondary`. One constant covers `app/(app)/layout.tsx`,
  `app/user/[username]/page.tsx` and `app/(app)/loading.tsx`.
- `tabbarFadeClassName` (`components/custom/tabbarClasses.ts`) reads
  `--color-bg-secondary`, so its opaque end is exactly what the route behind it
  paints. This retires the last CSS consumer of `--color-bg-grouped`.
- `colour.bgGrouped` → `#fafafa` / `#171717`; `colour.bgSurface` → `#ffffff` /
  `#0a0a0a`. These are Untitled UI's `bg-secondary` and `bg-primary` written out
  in hex, which fixes `viewport.themeColor`, the manifest and the `/brand`
  swatches from one place.

**This supersedes ADR-0024's flat white page, and says so here rather than
leaving it implied.** That flattening was already undone in practice by the
Untitled UI adoption three days ago; nobody wrote it down, which is how the
token was left describing a page that no longer existed. Light-mode cards read
as raised by colour again.

## Why the tokens are hex and not `var()`

`viewport.themeColor` is a `<meta>` tag and the manifest is a JSON document.
Neither can read a CSS custom property. The file already gave that reason; what
it lacked was any force keeping the hand-written copy in step with the class the
page actually carries. The docstrings now name the Untitled UI class each token
mirrors, so the next person moving one has the other's address.

## Consequences

- The signed-in app, the public profile and the loading fallback all stand on
  the page colour. The rail reads as raised chrome for the first time.
- The grid hover pill (`CardItem.tsx`, `CardsPokedex.tsx`) has real contrast
  instead of being the canvas colour with a ring on it.
- Open Graph images go `#ffffff` → `#fafafa`, matching the page. Cosmetic.
- One rejection came back into `lib/design/tokens.test.ts`: `#767676` is under
  AA on a `#fafafa` page. It had been deleted when ADR-0024 made the page white,
  on the reasoning that the background it failed against was gone. The
  background is back, so the measurement is live again. **A rejection deleted
  because its context changed is a rejection that has to be re-checked when the
  context changes back** — which is the argument for writing rejections down as
  tests rather than as prose.
## The check that would have caught it

Bart asked for this after reading the consequences above, so it is part of the
same change rather than a follow-up record.

`lib/design/token-surfaces.test.ts` resolves what the app actually paints and
compares it to the token, one real link at a time:

```
app/layout.tsx          →  class bg-secondary
tailwind.generated.css  →  --color-bg-secondary: var(--color-neutral-50)
tailwindcss/theme.css   →  oklch(98.5% 0 none)
the test                →  #fafafa
```

Reading Tailwind's own `theme.css` rather than hard-coding its ramp is
deliberate: a Tailwind upgrade that retunes `neutral-50` moves the page, which
is the same failure wearing different clothes.

**Both directions were proved to fail before the fix was trusted**, not merely
to pass after it. Reverting `bgGrouped` to `#ffffff` fails with *"colour
.bgGrouped.light says #ffffff, but app/layout.tsx paints bg-secondary which
resolves to #fafafa"*. Moving the class instead, to `bg-primary`, fails from the
other side — and takes a second assertion with it, that html and body still
agree, since two different page colours give the same overscroll seam from the
opposite direction.

Why the existing tests could not: `tokens.test.ts` compares the module to the
*generated stylesheet*, which is generated from the module, and every contrast
test measures against `surfaces`, also built from the module. The palette agreed
with itself about a page that had not existed for days. This is the only test in
the design folder that reads a component file, and that is the point of it.

### What the second half of it found

The same file asserts that every colour token paints something, as an exact set
rather than a tolerant allow-list. Two exclusions are load-bearing and were both
found by the check reporting a wrong answer first:

- `lib/design/tokens.ts` itself — the `surfaces` fixture reads `colour.glass` to
  composite a contrast backdrop. That is the module talking to itself, and it is
  exactly how `glass` read as alive.
- `app/brand/page.tsx` — it renders a swatch of every token by design, so
  counting it means no token can ever be reported dead.

**Five of eleven colour tokens paint nothing**: `labelQuaternary`, `glass`,
`tint`, `tintLabel`, `danger`. Recorded with a reason each rather than deleted —
removing them takes measured rationale and the `surfaces` fixtures with it, which
is a decision for its own record.

Two more are closer to dead than they look and are deliberately *not* on that
list: `labelSecondary` and `labelTertiary` have no consumer in the app, and are
alive only because the two Open Graph images render them (Satori draws from
inline styles and cannot read a stylesheet). So the AA sweep measuring those
tiers against a glass card is measuring a real colour against a surface nothing
has rendered since ADR-0061.

## Clearing app/globals.css

Also asked for in the same breath, and the same problem one level up: the file
was 694 lines, of which about 70 were CSS. The rest defended values it no longer
declares — the glass surfaces, the shadow stack, the border ramp, a spacing
scale, and a globe, a résumé and a photographic backdrop belonging to the
portfolio this CSS was ported from. Four migrations took the declarations; the
paragraphs stayed and read as current fact.

**Deleted rather than archived in place**, with a header pointing at where the
reasoning actually lives (ADR-0056, ADR-0061, ADR-0089, `lib/design/tokens.ts`,
and `git log -p`). A comment beside no code is worse than no comment: it is the
same failure as a token that no longer names its surface, in prose.

694 → 269 lines. **Every declaration is byte-identical** — verified by stripping
comments from both versions and diffing, 91 lines each way, no difference — so
this changes no pixel. What is kept is what explains live code: the layer order
(ADR-0012), the Lightning CSS `light-dark()` note that `ThemeProvider` depends
on, the seven layout tokens, the LCP measurement behind `pageEnter`, and the
`!important` justification the reduced-motion block needs.

One stale claim was found and left alone deliberately: `tokens.ts` and
`Wordmark.tsx` both say `--fs-label` "stays" in `globals.css`. It is not
declared anywhere and has not been for some time. Out of scope here.
