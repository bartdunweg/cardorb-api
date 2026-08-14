---
id: ADR-0007
title: Shared form/signin React components replace form.css and signin.css
status: accepted
date: 2026-08-14
scope: repo
deciders: [Bart]
superseded-by: null
tags: [css, tailwind]
---

# Shared form/signin React components replace form.css and signin.css

## Context and problem statement

Continuing the Tailwind migration (see ADR-0013), the next chunk was
`app/styles/form.css` (the `.cards-profile-*` classes) and
`app/styles/signin.css` (`.page-signin`, `.signin-*`), shared across the
login, signup, forgotten-password, set-password and profile-screen sign-in
forms — 8 consumer files in total, several repeating the same 3–6 classes.

Two sub-decisions needed making:

1. How to migrate a class shared by many consumers to Tailwind without
   repeating a long, easy-to-drift utility string at every call site — the
   exact risk form.css's own header comment warned about ("there is one
   password box in the app rather than two that drift").
2. `app/styles/form.css` turned out to also style `.card-add-field input`
   (via a joint CSS selector with `.cards-profile-field input`) —
   `.card-add-field` itself belongs to `CardAddDialog.tsx`/`cards.css`, a much
   later, much larger migration chunk. Deleting form.css whole would have
   silently dropped `CardAddDialog`'s placeholder colour and focus-visible
   border.

## Considered options

1. **Inline the full Tailwind utility string at every call site.** Simple,
   but reintroduces the exact drift risk the shared CSS classes existed to
   prevent — a change to the field's padding would need editing 6+ files
   correctly.
2. **Shared React components** (`FormField.tsx`: `FormNote`, `FormError`,
   `FormHint`, `FormForm`, `FormField`, `FormLabel`, `FormInput`;
   `SigninShell.tsx`: `SigninShell`, `SigninOr`, `SigninLinks`,
   `SigninNotice`, `signinWideButtonClassName`) — one file each holds the
   utility classes once, consumers import and compose.
3. **`@apply` in a `@layer components` block**, keeping named CSS classes.
   Rejected for the same reason ADR-0013's roadmap gives for `components.css`:
   it reintroduces a CSS abstraction layer with its own cascade questions and
   loses variant composition, where a plain component does not.
4. On the `.card-add-field` coupling: **delete form.css entirely and inline
   its two rules directly into `CardAddDialog.tsx`'s inputs** (scope creep
   into the cards.css chunk) vs. **keep a slimmed-down form.css** holding only
   the two rules `.card-add-field` still needs, with an updated header
   comment, until the cards.css chunk migrates that class too.

## Decision

We will use shared React components (option 2), matching the precedent
`Card.tsx` already set for `.about-card`/`.bento-card`. `SignInForm` gained a
`layout: "row" | "column"` prop — it is the one component rendered in both a
`.page-signin` context (column) and inline in the profile screen (row),
mirroring the `.page-signin .cards-profile-field` CSS override it replaces.

On the `.card-add-field` coupling: we will keep `form.css`, slimmed to just
the two rules `CardAddDialog.tsx` still needs (option 4b), rather than expand
this chunk's scope to migrate `cards.css`'s `.card-add-field` too. The file's
header comment now says why it still exists and when it can go.

While migrating `not-found.tsx`, found and fixed a pre-existing bug: it used
`className="signin-note"`, which no CSS rule ever matched (the real class was
`.signin-notice`, used elsewhere for a different, boxed treatment) — the 404
page's description paragraph was rendering unstyled. Replaced with `FormNote`.

## Consequences

- Good, because the "one password box" sharing form.css's comment cared about
  is now enforced by TypeScript imports rather than by a class name convention
  nothing checks.
- Good, because `SigninShell` collapses 5 near-identical page bodies
  (login/signup/forgotten/set-password/not-found) into one component plus a
  title and children.
- Neutral, because `form.css` is not fully gone yet — it is 8 lines instead of
  92, with a comment explaining the remainder belongs to a later chunk.
- Bad, because two new shared files (`FormField.tsx`, `SigninShell.tsx`) exist
  that a future reader has to know to check before adding a new form —
  discoverability relies on the imports being visible in each consumer, same
  as the shared `Button`/`Card` components already in this codebase.

## Confirmation

`npm run typecheck`, `npm run test` (301 tests) and `npm run lint` all pass.
A `grep` sweep confirmed no remaining JSX references to any of the removed
class names (`cards-profile-*`, `page-signin`, `signin-*`). A live visual pass
was blocked this session by an unrelated, concurrent routing conflict
(`app/api/v1/cards/[id]/route.ts` vs the existing `[tcgId]` route, not part of
this change) that prevents `next dev` from booting at all — pending a visual
pass once that's resolved.

## Related

- Supersedes: none
- Related: ADR-0013 (Tailwind entry-point scope)
- Code: `app/components/FormField.tsx`, `app/components/SigninShell.tsx`,
  `app/styles/form.css`
