---
id: ADR-0006
title: Generate the username at signup instead of asking for it
status: accepted
date: 2026-08-14
scope: repo
deciders: [Bart]
superseded-by: null
tags: [auth, signup, accounts]
---

# Generate the username at signup instead of asking for it

## Context and problem statement

Signup asked for three things: email, password, and a username — validated
client- and server-side, claimed atomically by the `handle_new_user()` trigger
so a taken name failed the whole signup rather than leaving an account with no
name to reach it by. That third field is a naming decision made before there
is anything to name: the person has not seen their collection yet, and picking
a permanent-feeling public link under that pressure is friction the other two
fields don't have. Settings already has a working way to change the username
later (`ProfileSettings.tsx`, `POST /api/v1/username`, the `claim_username`
RPC), so the question was whether signup needs to collect it up front at all.

## Considered options

1. **Keep the required username field at signup** — the status quo; correct
   but front-loads a decision the person isn't ready to make.
2. **Fall back to the existing UUID-based generator already in the DB
   trigger** (`'u' || replace(new.id::text, '-', '')` in `handle_new_user()`,
   meant for accounts created outside the signup route) — zero new code, but
   user-facing: it would show as `u4f2a91...` on the public profile link
   before the person customizes it, reading as a bug rather than a feature.
3. **Generate a friendly name server-side in the signup route** — an
   adjective + noun + digits (`generateUsername()` in `lib/core/account.ts`),
   checked against the same taken/reserved logic the form used to rely on,
   with a short retry loop before falling back to an error.

## Decision

We will generate the username server-side in `app/api/v1/signup/route.ts`
using `generateUsername()`, drop the username field from `SignUpForm.tsx`, and
leave username *changes* to the Settings flow that already existed.

Chosen because it removes a decision from the moment with the least context
to make it (signup) without leaving the account with a name that looks broken
(the UUID fallback), and because the collision-checking logic the form used to
lean on is reused as-is — the route now runs it in a small retry loop instead
of returning it to the client as a validation error.

## Consequences

- Good, because signup is two fields instead of three, and every account has
  a usable, non-embarrassing public link the moment it's confirmed.
- Good, because no changes were needed to Settings, the `claim_username` RPC,
  or the `handle_new_user()` trigger — the generated name flows through the
  same `options.data.username` metadata path a typed one used to.
- Bad, because the generated name is nobody's first choice; anyone who cares
  about their link has to know to go find it in Settings and change it. That
  discoverability isn't solved here.
- Neutral, because the word lists are small (~20 adjectives, ~20 nouns) and
  inline in `lib/core/account.ts` — fine for now, would need revisiting if the
  generated name space needs to grow.

## Confirmation

`npm run check` (typecheck + test + lint) passes. Manually: sign up with only
an email and password, confirm the account, and see a generated
`adjective-noun-1234`-shaped username on the profile; then use the existing
Settings username panel to claim a custom name.

## Related

- Code: `lib/core/account.ts`, `app/api/v1/signup/route.ts`,
  `app/components/SignUpForm.tsx`, `app/hooks/useSession.ts`
