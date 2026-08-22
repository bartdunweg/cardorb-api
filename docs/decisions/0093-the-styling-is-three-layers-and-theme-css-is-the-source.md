---
id: ADR-0093
title: The styling is three layers, and theme.css is the only source
status: accepted
date: 2026-08-22
scope: repo
deciders: [Bart]
superseded-by: null
tags: [css, tailwind, untitled-ui, tokens, light-dark, rebuild]
---

# The styling is three layers, and theme.css is the only source

Supersedes the arrangement ADR-0013 and ADR-0054 built: `lib/design/tokens.ts`
generating `app/styles/tailwind.generated.css`. Those records are still the best
account of *why* a generator was needed at all, and that argument survives —
only its direction changed.

## Context and problem statement

An audit of the styling layer found less debt than expected: 69% of 2,949 CSS
lines were Untitled UI's generated palette, 16% documentation, and **203 lines
were hand-written**, none of them a class selector. There was no old CSS left to
clean up.

What there was instead was a structural problem the line count hides:

- **Every colour was declared twice.** Untitled UI ships a `@theme` block plus a
  `.dark-mode` block, pasted in whole. 649 declarations, 324 unique names.
- Bridging that onto this app cost **two selectors** — `[data-theme="dark"]`
  plus a `prefers-color-scheme` twin with `:not([data-theme="light"])` — because
  a flat dark set cannot answer "what does this machine prefer".
- Meanwhile Card Orb's *own* colours were already `light-dark()` pairs. Half the
  palette was modern and half was legacy, and nobody had chosen that.
- **320 of the 649 declarations were unreachable** from any className or `var()`.

Bart's instruction was explicit and worth quoting, because it decided the
method: *"ik wil niet incrementeel migreren. Ik heb liever dat de styling in één
keer helemaal weg is en dat schermen er kapot uitzien, dan dat we weken bezig
zijn met half-oud/half-nieuw naast elkaar. Kapot is zichtbaar en oplosbaar.
Half-gemigreerd is onzichtbaar en sleept."*

## Decision

Three layers, and one source.

```
styles/
├── theme.css     tokens only, not one selector
├── globals.css   imports, plugins, variants, base — hard ceiling 200 lines
└── app.css       only what Tailwind cannot express; starts empty
```

Plus `app/styles/poke-holo.css`, kept deliberately: the holographic shine is a
feature, not a styling layer (ADR-0061), and it is vendored, so inlining it into
`app.css` would end its diffability against upstream.

**`theme.css` is Untitled UI's own theme**, from `npx untitledui@latest init`,
taken name-for-name. Nothing renamed, only added to. It is a superset of what
the vendored components were built against — 16 tokens added, none removed.

**Dark mode is `light-dark()`, not `.dark-mode`.** This departs from the brief,
which asked for a dark block. The reason is the brief's own rule: one value
lives in one place, and a dark block is a second place 324 times. It also
deletes the bridge — `light-dark()` reads `color-scheme`, which `globals.css`
sets from the `data-theme` attribute the app already writes before first paint,
so all four theme cases fall out of one declaration.

**The generator runs the other way.** `styles/theme.css` is the source;
`scripts/extract-theme-values.mjs` resolves values out of it and writes
`lib/design/theme-values.generated.ts`. That is what makes "no hex outside
theme.css" true rather than aspirational, for the four consumers that cannot
read a stylesheet: `app/manifest.ts` (JSON), `viewport.themeColor` (a JS
object), and both OG images (Satori, no browser). It resolves rather than
copies, walking `var()` and `light-dark()` down to a literal.

## Consequences

| | Before | After |
|---|---|---|
| CSS files a browser loads | 2 | 2 (`globals` + `poke-holo`) |
| Total CSS lines | 2,949 | 882 |
| Shipped CSS | 205 kB | 179 kB |
| Colours declared twice | 324 | 0 |
| Selectors needed for dark mode | 2 | 0 |
| Hex outside the theme | 15 | 0 |

- Card Orb's label colours are aliases of Untitled UI's text tokens now rather
  than hand-picked hex, so body text moves `#111111` → `#171717` and secondary
  `#666666` → `#404040`. Higher contrast, not lower.
- `tailwindcss-animate` and `tailwindcss-react-aria-components` are installed.
  Untitled UI's own template expects both; 17 call sites use `selected:` /
  `pressed:` and vendored components use `animate-in` / `animate-out`.
- `poke-holo.css` moved into `@layer components`. It had been unlayered, and
  unlayered CSS beats layered CSS outright — every rule in it won against every
  utility in the app, wanted or not. The layer order is declared in both that
  file and `globals.css`, because five route files import it directly and
  nothing guarantees which chunk parses first.
- **Six token families and the shape system were destroyed and had to be put
  back** — see ADR-0094, which is the more useful record of the two.
- `lib/design/tokens.ts`, `untitled-theme.css`, `gen-tokens.mjs` and 1,353 lines
  of token tests are gone. **The measured contrast arguments went with them.**
  That is a real loss and it is not recovered by this record; `git show
  22ca2cb~1:lib/design/tokens.ts` is where they are.

## Alternatives considered

**Incremental migration, UI pixel-identical throughout.** Proposed mid-way, in a
brief describing exactly that. Rejected on Bart's own reasoning above, and
because it did not match the codebase: it is written for a project whose CSS is
messy and must keep working, and this one's CSS was already clean.

**Keep `.dark-mode`, as the brief asked.** Rejected on the brief's other rule.
Reversible: it is one function in the generator.

**Delete `poke-holo.css` too.** Rejected by Bart directly — *"poke holo mag
blijven"* — and it was the right call: it is a feature.

## Confirmation

The fold was measured **before** it was adopted, not after. 491 colour tokens
read in a real browser across all four theme states — machine light and machine
dark with no choice made, and both explicit choices against the machine — on the
built stylesheet, old shape versus new.

- **Light: 0 of 491 differ**, by either route to it.
- Dark: 101 differ, and all 101 are tokens no className or `var()` in this app
  can reach. They existed only in dark and never in light, so no component could
  have used them.
- Every token differs between themes, and both routes to a theme agree.
- The `--color-orb-*` aliases resolve byte-identically to the Untitled UI tokens
  they point at, which is the single-source claim proved rather than asserted.

`npm run check` exits 0: Prettier, `extract-theme-values --check`, typecheck,
452 tests, lint. `npm run build` passes. The landing page was loaded in a browser
and renders as it did before the rebuild.
