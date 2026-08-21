---
id: ADR-0076
title: One database, warned about loudly — not two databases, and not a block
status: accepted
date: 2026-08-21
scope: repo
deciders: [Bart, Claude]
superseded-by: null
tags: [development-environment, data, safety]
---

# One database, warned about loudly — not two databases, and not a block

## Context and problem statement

An SEO review read the live HTML of `cardorb.com/user/bartdunweg` and found the
page titled **"UI test 2416's Pokémon card collection"** — in the `<title>`, the
`<h1>`, the OG image and the `CollectionPage` JSON-LD of a route that is indexed
and in the sitemap.

The code was correct throughout. `ownerLabel()` resolves `displayName || username`
exactly as ADR-0034 intends, and the Settings field even previews the outcome:
*"What your collection is called: '…'. Empty means your username."* The username
was `bartdunweg` and always had been. The defect was one row of production data.

**The string appears nowhere in this repository.** It was typed, not generated.

The mechanism is the finding worth recording:

- **There is one Supabase project.** `.env.local` points `npm run dev` at the
  same project production uses. There is no dev project, no staging project, and
  no `.env.production`. A form filled in on localhost is a form filled in on
  cardorb.com.
- **The screenshot harness makes that concrete, and deliberately.**
  `visual/auth.setup.ts` signs in as the real owner account through the service
  role key, because a fresh test account has no sixteen hundred cards to
  photograph. Its own docblock argues this well. It also means every signed-in
  test drives the real profile.

A read of `public.profiles` found **five rows and two test names**: `bartdunweg`
held "UI test 2416" and `test` holds "UI test 2025". Only the first was public.

## Decision

**Three things, and the middle one is the decision.**

1. **The row was corrected by emptying `display_name`, not by typing the username
   into it.** `ownerLabel()` then falls back to the username, which is what
   ADR-0034 built the fallback for — and it keeps "no name given" distinguishable
   from "a name that happens to match the username", which that record went out of
   its way to make possible. Verified live: the page now titles
   `bartdunweg's Pokémon card collection`.

2. **A development server that talks to a hosted database says so, in a red bar
   across the top of every page.** `components/custom/LiveDataWarning.tsx`. It
   renders nothing when `NODE_ENV === "production"` and nothing when the database
   is a local Supabase stack on `127.0.0.1`. Proved both ways: `next start`
   against the production build returns zero occurrences; the dev server renders
   the bar naming the actual project.

3. **The harness moves to a test account with a copied collection.** Agreed, not
   built here — it is its own change and it needs a seeded collection large
   enough to be worth photographing.

## Alternatives considered

- **A separate development or staging database.** The textbook answer, and the
  wrong one here. What this project *does* is match a hand-kept collection
  against three card catalogues; a dev database holding twelve cards cannot
  reproduce the bugs that actually occur, and one holding a copy of the real
  collection has to be kept in sync forever by somebody who will not do it. Cost
  was not the objection — Supabase's free tier has historically allowed a second
  project, though that was not verified this session. **Usefulness was the
  objection.**
- **Refusing writes when localhost points at the hosted project.** Rejected
  because it breaks legitimate work in both directions: the harness signs in as
  the real owner on purpose, and fixing a bad production row from a local checkout
  is a reasonable thing to want. More importantly it does not address the failure.
  **Nobody lacked a permission. Somebody did not realise the page was live.**
- **A UI change to the Settings form.** Rejected because the form is already
  right: the hint states what the public page will be called and the placeholder
  previews the empty-field fallback. There was nothing to improve there.
- **Fixing `test`'s "UI test 2025" at the same time.** Not done. It is a private
  profile, it was not in scope, and changing somebody's row because it looks
  wrong from here is the habit this record exists to discourage.

## Consequences

- Every local page now carries a red bar until the database is local or the build
  is a production one. That is intrusive by design; a warning nobody notices is
  the failure being fixed.
- **It does not stop anything.** A person who reads the bar and types into the
  form anyway still writes to production. This raises the odds of noticing, which
  is all it claims to do.
- The bar names the Supabase project ref in the page it renders into. That ref is
  already in the public client bundle as `NEXT_PUBLIC_SUPABASE_URL`, and the
  component never renders in production, so nothing new is exposed.
- **The repo's own raw-hex guard caught the first version of this file**, which
  wrote `bg-[#7f1d1d]`. It uses `bg-error-solid` now. Worth recording because it
  is the guard working on the one file whose subject is not letting the wrong
  thing through quietly.

## Related

- `docs/decisions/0034-collection-named-after-its-owner.md` — `ownerLabel()`, and
  why an absent display name falls back to the username rather than to anything
  generic.
- `docs/decisions/0051-*` and `visual/auth.setup.ts` — the harness's reasoning for
  signing in as the real owner, which point 3 above revisits rather than refutes.
