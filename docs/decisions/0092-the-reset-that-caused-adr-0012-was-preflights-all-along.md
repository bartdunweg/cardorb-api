---
id: ADR-0092
title: The reset that caused ADR-0012 was Preflight's all along
status: accepted
date: 2026-08-22
scope: repo
deciders: [Bart]
superseded-by: null
tags: [css, tailwind, preflight, cascade-layers, globals, cleanup]
---

# The reset that caused ADR-0012 was Preflight's all along

## Context and problem statement

`app/globals.css` opened with three declarations that every route paid for:

```css
*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}
```

This is the reset at the centre of ADR-0012, this project's most expensive CSS
bug. It sat unlayered while Tailwind wraps its output in `@layer utilities`, and
an unlayered rule beats a layered one regardless of specificity or source order.
The effect was that **every margin and padding utility added during the whole
Tailwind migration silently lost to it**. `gap-*` was unaffected, which is why
the screenshots looked fine and nobody caught it for weeks. ADR-0012 fixed the
symptom by moving the hand-written sheets into a named `legacy` layer.

Auditing the styling layer for what could be deleted, the reset was compared
against `node_modules/tailwindcss/preflight.css` for the first time:

```css
*,
::after,
::before,
::backdrop,
::file-selector-button {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  border: 0 solid;
}
```

**It is the same reset.** Preflight's selector list is a strict superset, its
declarations are identical, and it resets `border` as well. The rule in
`globals.css` never added anything to the page. It only ever won a fight it
should not have been in.

The same is true of a second rule further down:

```css
a,
button,
[role="button"] {
  -webkit-tap-highlight-color: transparent;
}
```

Preflight sets `-webkit-tap-highlight-color: transparent` on `html, :host`
(line 50), and the property inherits.

## Decision

Delete both rules. Also delete `@keyframes pageEnter`, which had no consumer
anywhere in the repository and is not an `--animate-*` theme key, so it was
unreachable as a utility too.

Keep the `@layer theme, base, legacy, components, utilities;` declaration.
Nothing in `globals.css` depends on it any more, but `app/styles/poke-holo.css`
is still unlayered, and the declaration is what keeps that hazard legible to the
next reader.

## Consequences

- `app/globals.css`: 293 → 261 lines. No render changes — the declarations were
  duplicates and the keyframe had no caller.
- **ADR-0012's root cause is removed, not just its symptom.** The `legacy` layer
  still exists and is still correct; it now guards nothing that fights Preflight.
- The header of `globals.css` is rewritten to say this. The previous version
  described "three resets" and cited the reset as a live hazard — a comment that
  had become the opposite of true.

## Alternatives considered

**Keep the reset because it is explicit.** Rejected. An explicit duplicate of a
framework default is not documentation; it is a second source that can drift,
and this one drifted into a cascade bug that took weeks to find. Preflight is
loaded unconditionally by `@import "tailwindcss"` at
`app/styles/tailwind.generated.css:19`; if it ever stops being, that is the
change that should be noticed, not silently absorbed.

**Delete the `legacy` layer too, since nothing in the file needs it now.**
Deferred, not rejected. `poke-holo.css` is unlayered and deliberately so; while
that is true the layer order is still the honest description of this project's
cascade. It goes when `globals.css` goes.

## Confirmation

`./scripts/verify.sh` — `secrets`, `format`, `tokens`, `typecheck`, `test`,
`lint` and `build` all pass. `standards` and `record numbers` fail identically
on a stashed tree, so both pre-date this change: the first is the shared
standard moving from v0.22.0 to v0.23.0 plus ADR-0053's deliberate `docs/`
placement, the second is the doubled ADR-0084 and ADR-0086 that `STATE.md`
already records as red on `main`.

The claim that matters here is not testable by a screenshot — two identical
declarations produce identical pixels either way. The evidence is the byte
comparison against `node_modules/tailwindcss/preflight.css`, quoted above.
