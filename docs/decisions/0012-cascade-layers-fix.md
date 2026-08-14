---
id: ADR-0012
title: Legacy CSS moved into a named layer — Tailwind utilities were silently losing to it
status: accepted
date: 2026-08-14
scope: repo
deciders: [Bart]
superseded-by: null
tags: [css, tailwind, bug]
---

# Legacy CSS moved into a named layer — Tailwind utilities were silently losing to it

## Context and problem statement

While migrating `app/(app)/layout.tsx` and `app/user/[username]/page.tsx`'s
`.page-cards`/`.cards-main` classes (the start of the `cards.css` chunk), a
computed-style check on the login page — done because something looked
subtly off once a live dev server became available — showed `padding: 0px`
on an element carrying `p-[var(--card-pad)]`. Investigation traced this to a
structural bug that had been present since ADR-0013 (session start), affects
**every Tailwind utility touching `margin`/`padding` added anywhere in this
migration**, and had gone undetected through five prior chunks' visual
passes.

The mechanism: `@import "tailwindcss"` wraps every utility Tailwind
generates in `@layer utilities` (and `theme`/`base`/`components`). Every
hand-written CSS file in this app (`tokens.css`, `base.css`, `components.css`,
`pages.css`, `form.css`, `landing.css`, `cards.css`, `poke-holo.css`) was
plain, **unlayered** CSS. Per the CSS Cascade Layers spec, an unlayered
declaration always beats a layered one for the same property on the same
element, regardless of specificity or which comes later in the source —
there is no way to out-specificity or out-order it. `tokens.css`'s own
`*, ::before, ::after { margin: 0; padding: 0; }` reset therefore silently
overrode every `p-*`/`m-*`-shaped Tailwind class this migration had added,
in every chunk. `gap-*` utilities were unaffected (gap isn't touched by that
reset), which is why screenshots taken during each chunk's build-quality
pass looked plausible — visible internal spacing came from `gap` between
children and from a large `border-radius` creating an optical illusion of
padding near corners, not from the padding utilities themselves.

## Considered options

1. **Add `!important` to Tailwind's padding/margin utilities** (via
   Tailwind's `!` prefix) at every call site that needs to win. Rejected —
   treats the symptom at every future call site individually, forever,
   rather than the cause once.
2. **Wrap the hand-written CSS in a named layer positioned before
   Tailwind's layers entirely** (`@layer legacy, theme, base, components,
   utilities;`). First attempt — overcorrected: it also put legacy CSS below
   Tailwind's own Preflight (`@layer base`), so `.btn`'s background/border
   then lost to Preflight's `<button>` reset (Preflight explicitly clears a
   button's default background/border as part of normalizing form elements).
   Caught by re-screenshotting immediately after the first fix.
3. **Wrap the hand-written CSS in a named layer positioned between
   Tailwind's `base` and `components`/`utilities` layers**
   (`@layer theme, base, legacy, components, utilities;`), via
   `@import "..." layer(legacy);` on every hand-written import. Hand-written
   CSS still beats Preflight (as it always did); any Tailwind utility class
   added by this migration now correctly beats hand-written CSS (as every
   prior chunk's reasoning assumed was already true).

## Decision

Option 3. `app/globals.css` now declares `@layer theme, base, legacy,
components, utilities;` before importing `tailwind.generated.css`, and every
hand-written sheet imports with `layer(legacy)`
(`app/globals.css`, `app/styles/collection.css`). This is a two-line-per-file
change with no effect on how hand-written CSS rules cascade against each
other (they're all still in one shared `legacy` layer, so their existing
relative order/specificity is unchanged) — it only changes how they resolve
against Tailwind classes.

Fixing this also exposed one real, previously-masked bug: `tabbarClasses.ts`
(ADR-0010) ported tabbar.css's generic `>=641px` "move to the top of the
screen" desktop behaviour faithfully, but every real consumer
(`CardsTabBar.tsx`) always combines it with `.cards-tabbar`, whose own
cards.css rule already repositions it to the bottom for 641–1000px and hides
it outright at >=1001px. While the cascade bug was live, the unlayered
`.cards-tabbar` override always won regardless, masking the fact that the
ported desktop-top-nav utility classes were dead weight. Once Tailwind
utilities started winning as intended, that dead branch actively fought the
still-CSS override and put the bar at the top of the screen at 641–1000px —
caught immediately by re-screenshotting, not by a type or a test. Removed
the dead branch from `tabbarClasses.ts` rather than fixing it forward, since
it has no reachable use in this app.

## Consequences

- Good, because every Tailwind utility class added by this migration now
  behaves the way every prior chunk's ADRs assumed it already did.
- Good, because this was caught mid-migration rather than after declaring
  the whole thing done — the remaining chunks (`cards.css`, `landing.css`)
  build on a now-correct foundation instead of inheriting the bug.
- Bad, because every chunk from ADR-0013 through ADR-0011 shipped with this
  bug present, and their build-quality "Interface: pass" verdicts were
  based on screenshots that did not actually prove padding/margin worked —
  only that `gap`-based spacing and border-radius optical effects looked
  plausible. A full revisit of prior chunks' rendered output, now that the
  fix is in, is warranted rather than assumed clean by inference.
- Neutral, because this is exactly the kind of bug a live dev server catches
  and a pure CSS-diff review does not — it's the reason a visual pass was
  called out as an explicit unresolved risk in every build-quality report
  since the routing conflict started blocking `next dev`.

## Confirmation

Verified via `getComputedStyle` on the login page's card (`padding: 24px`,
matching the tablet `--card-pad` step, not `0px`) and on `.btn` (background/
border restored). Re-screenshotted `/`, `/login`, `/signup`,
`/password/forgotten`, a 404 page, and `/user/<name>` (rail/tabbar/toolbar)
after the fix. `npm run typecheck`, `npm run test` (313 tests) and
`npm run lint` all pass. The remaining risk: components migrated in earlier
chunks that were **not** re-screenshotted this pass (settings pages, behind
auth this session couldn't reach) should get a visual check before this
migration is considered fully verified.

## Related

- Supersedes: none (amends the mental model ADR-0013 through ADR-0011 were
  built on, without changing their actual class-mapping decisions)
- Code: `app/globals.css`, `app/styles/collection.css`,
  `app/components/tabbarClasses.ts`
