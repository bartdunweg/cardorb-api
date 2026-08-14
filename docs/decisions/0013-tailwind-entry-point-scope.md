---
id: ADR-0013
title: Tailwind's entry point moved from collection.css to globals.css
status: accepted
date: 2026-08-14
scope: repo
deciders: [Bart]
superseded-by: null
tags: [css, tailwind]
---

# Tailwind's entry point moved from collection.css to globals.css

## Context and problem statement

The user asked for a full migration of the app's legacy CSS to Tailwind. Before any
component-level migration could start, two structural problems in the existing CSS
setup needed a decision:

1. Tailwind's entry point — `@import "tailwindcss"` plus the generated `@theme` block,
   living in `app/styles/tailwind.generated.css` — was only imported by
   `app/styles/collection.css`, itself imported directly by the 4 route files that draw
   a collection (`app/(app)/layout.tsx`, `app/cards/[id]/page.tsx`,
   `app/user/[username]/page.tsx`, `app/@modal/(.)cards/[id]/page.tsx`). Every other
   route — login, signup, settings, the landing page, 404 — had zero Tailwind utilities
   available, because `app/globals.css` (imported once by the root layout, reaching
   every route) never imported `tailwind.generated.css`.
2. Separately, whether to extend `scripts/gen-tokens.mjs` / `lib/design/tokens.ts` to
   register spacing/typography/radii/shadows in `@theme` (not just colour) as part of
   migrating the first two files.

## Considered options

1. **Move `tailwind.generated.css`'s import into `globals.css`** (first import, ahead
   of `tokens.css`), and leave `collection.css` importing only `cards.css` +
   `poke-holo.css`.
2. **Leave Tailwind scoped to `collection.css`** and re-import `tailwind.generated.css`
   into every other route-specific stylesheet that starts needing Tailwind utilities.
3. **Create a second, separate `@theme`-bearing entry file** for non-collection routes.
4. On token scope: **extend the generator now** for every category a full migration
   will eventually need, vs. **extend it only when a specific chunk's consumer needs
   it**.

## Decision

We will import `tailwind.generated.css` from `app/globals.css`, first, before
`tokens.css`, and stop importing it from `collection.css`.

Chosen because `globals.css` is the one file guaranteed to load on every route (it's
imported once by the root layout), matching the same "one file, no nesting" shape that
already made colour utilities work on the 4 collection routes — the existing code
comment in `tailwind.generated.css` documents why nesting an `@theme` block inside
another imported CSS file makes Tailwind's plugin never see it. Option 2 would
reintroduce per-route tracking of a single global concern; option 3 would split one
source of truth into two.

We will also not extend the token generator's scope in this same pass. The first two
files migrated (`card-shell.css`, `errors.css`) turned out to need only spacing values
that already match Tailwind's default scale (`--space-3` = 12px = `gap-3`) and
typography/colour values reachable via Tailwind v4's arbitrary-property syntax
(`[font-family:var(--font-main)]`, `text-label-tertiary` since colour is already
themed). Extending `@theme` for radii/shadows/typography is deferred to whichever later
chunk (`modal.css`, `settings.css`, `components.css`) actually needs `rounded-*` /
`shadow-*` utilities, rather than changing the token system ahead of any consumer that
needs it.

## Consequences

- Good, because every route now has Tailwind utilities available, unblocking
  component-by-component migration outside the 4 collection routes.
- Good, because the token system stays untouched until a real consumer forces the
  next extension, keeping each migration chunk's diff scoped to what it actually needed.
- Neutral, because `collection.css`'s own header comment ("Order still holds") had to
  be corrected — it previously implied `tailwind.generated.css` was still imported from
  there.
- Bad, because the full token-scope extension (spacing/typography/radii/shadows into
  `@theme`) is still pending and will need its own decision record when a later chunk
  requires it, since the plan text from this session's kickoff assumed it would happen
  now and it didn't.

## Confirmation

Verified by inspecting the compiled dev CSS served for `/login` (a route outside the
old `collection.css` tree) and confirming Tailwind utility classes used only in
`RouteError.tsx` (`text-label-tertiary`) and `layout.tsx` (`max-sm:pt-0`) are present in
that route's bundle. `npm run check` (typecheck + 293 tests + lint, including the token
generator's `--check`) passes.

## Related

- Code: `app/globals.css`, `app/styles/collection.css`,
  `app/styles/tailwind.generated.css`, `scripts/gen-tokens.mjs`
