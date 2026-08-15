---
id: ADR-0026
title: One Navbar component, sticky, shared by the landing page and the door screens
status: accepted
date: 2026-08-15
scope: repo
deciders: [Bart]
superseded-by: null
tags: [navbar, layout, components]
---

# One Navbar component, sticky, shared by the landing page and the door screens

## Context and problem statement

`app/page.tsx`'s nav and `SigninShell.tsx`'s wordmark (added this session as
a way back to `/` from the door screens) each had their own top/side padding.
Bart: "die navbar altijd zoveel ruimte aan de bovenkant en zijkant heeft of
zo... 'Cart-op' staat helemaal linksboven zonder ruimte." He then also asked
the landing nav to stay visible while scrolling rather than scroll away.

## Considered options

1. **Keep two copies, fix the padding to match by eye.** Rejected — exactly
   the kind of drift a shared component exists to prevent (the same argument
   `FormField.tsx`/`SigninShell.tsx` already make for their own pieces).
2. **One `Navbar` component**, landing page passing `center`/`right` slots,
   door screens passing neither (wordmark alone). Chosen.

For stickiness: **nest `Navbar` inside the page's own max-width-1180px
section** (simpler, one fewer element) vs. **hoist it above that section as
its own full-bleed sticky element** with its own inner 1180px-capped wrapper.
The first was tried first and rejected once sticky was added: nested inside
the constrained section, the bar's content stayed centred at 1180px on a
wider viewport while its background could not span the full width without
also being clipped by the section's own `overflow-hidden`. Hoisting it above
the section, with its own inner max-width wrapper repeating the same 1180px
figure, was the only way to get a background that goes edge to edge with
content that still lines up with the page below it.

## Decision

`app/components/Navbar.tsx`: `sticky top-0`, full-bleed, its own
`--space-4`/`--page-pad-x` padding, `--glass-bg-solid` + `backdrop-filter:
blur(16px)` background and a bottom hairline so scrolled content does not
show through. An inner `w-[min(100%,1180px)] mx-auto` div holds the actual
`grid-cols-[1fr_auto_1fr]` logo/center/right layout, matching
`app/page.tsx`'s own content cap.

`app/page.tsx`'s top-level return became `<div className="-mt-[var(--main-pad-top)]"><Navbar .../><section className="w-[min(100%,1180px)] mx-auto ...">...</section></div>` —
`Navbar` as a sibling before the constrained section, not a child of it, so
its sticky full-bleed background is never clipped by the section's own
`overflow-hidden` or width cap. `SigninShell.tsx` was restructured the same
way (`Navbar` then a centred-form `<div>`), with no `center`/`right` props —
wordmark only.

## Consequences

- Good: one component, one padding value, used both places; verified by
  curl against the rendered HTML that no `fixed`/legacy `sticky` class
  remained on the old SigninShell link.
- Neutral: `SigninShell.tsx` lost its own `Card`-wrapped form shell in the
  same pass (a separate, later instruction — "het inlogformulier hoeft niet
  in een kaart te staan") — unrelated to the Navbar change but touched the
  same file in the same session.

## Confirmation

`npm run check` green; `curl` against the running dev server confirmed the
sticky class list on both `/` and `/login`, and that the wordmark position
matched between them.

## Related

- `docs/decisions/0023-landing-drops-public-collection-links.md` — the same
  session's other landing-page change.
