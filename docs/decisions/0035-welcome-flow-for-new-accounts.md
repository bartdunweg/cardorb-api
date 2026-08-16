---
id: ADR-0035
title: A skippable welcome flow for new accounts
status: accepted
date: 2026-08-16
scope: repo
deciders: [Bart]
superseded-by: null
tags: [onboarding, accounts, profile]
---

# A skippable welcome flow for new accounts

## Context and problem statement

Signing up asks for an email address and a password and nothing else. That is
the right trade on a signup form — every extra field is a reason not to finish
one — but it leaves an account in a state nothing else corrects:

- The username is generated (`adjective-noun-1234`, ADR-0006), and that record
  closed by naming this exact gap: *"the generated name is nobody's first
  choice; anyone who cares about their link has to know to go find it in
  Settings. That discoverability isn't solved here."*
- `profiles.is_public` defaults to false, so `/user/<name>` — the public page,
  its OG image, its JSON-LD, the price stripping — is switched off for every
  new account, and nothing says it exists.
- `display_name` is seeded to the generated username, so Settings' "empty means
  your username" hint describes a state no new account is actually in.
- The first screen a confirmed account saw was `/collection`, whose empty state
  read *"The collection is not available right now. It should be back
  shortly."* — an outage message, shown to somebody whose collection is empty
  because they have not added anything yet.

The question: where do the facts the app already has fields for get asked, now
that an account can be new?

## Considered options

1. **More fields on the signup form** — ask for a username and a display name
   before the account exists.
2. **A dismissible checklist on the dashboard** — nothing blocks, a card lists
   what is left to set up.
3. **A blocking full-screen wizard, every step skippable**, shown once after
   the first sign-in, gated on a marker in the database.
4. **Nothing; improve Settings' discoverability instead** — a nudge or a badge
   pointing at the profile screen.

## Decision

We will show a four-step wizard at `/welcome` on first sign-in: username and
display name, avatar, sharing, and how to fill the collection. Every step can be
skipped and skipping writes nothing. A new nullable `profiles.onboarded_at`
column marks it done; `app/(app)/layout.tsx` redirects an account with a null
there to `/welcome` before it fetches anything.

Chosen because the four facts are all *defaults the app has already picked* —
a name, no picture, private, empty — and a default is easiest to change at the
one moment somebody is thinking about it. Option 1 puts them in front of account
creation, which is where they cost signups. Option 2 was tempting and rejected
on the same argument the empty-collection copy makes: a new account's first
screen is a grid with nothing in it, and a checklist beside nothing is a second
empty thing rather than a way through the first. Option 4 does not solve
anything ADR-0006 did not already leave unsolved.

We will **not** ask what you collect (favourite sets, generations, types).
Nothing in the app reads such a field, so it would be data collected with no
consumer, and it repeats the pattern the add-card dialog was corrected on twice
(`docs/feedback/0005`, `0006`): fewer fields, no decisions asked before there is
context to decide in.

The empty-collection state is split from the outage state in the same change,
because the flow's whole premise is that a new account is a normal thing now.
`getCollection()` in `lib/core/collection.ts` reports whether the fetch gave up;
an owner screen with an empty result and no failure says "No cards yet" and
offers the add dialog, and the outage sentence is kept for the outage.

## Consequences

- Good, because the generated username is now something you are shown and
  offered a chance to replace, rather than something you discover in Settings
  or, more likely, never.
- Good, because `is_public` is asked once, so the public page stops being a
  built feature nobody switches on.
- Good, because the first screen of a new account no longer claims an outage,
  and the fix applies to real outages too — those still say so.
- Bad, because it is one more screen between signing up and the app, on a
  product whose signup is deliberately two fields. Four Skips is the cost of
  getting it wrong for somebody who wanted none of it.
- Bad, because the wizard duplicates controls that also exist in Settings.
  Shared components (`AvatarPicker`, `SettingsSwitch`, the `FormField`
  primitives) keep one implementation, but the *copy* now exists in two places
  and can drift.
- Bad, because a `/welcome` that cannot save its last step is a screen nobody
  can leave — the layout would redirect straight back. Mitigated by every step
  being skippable and by finishing being a single one-key PATCH, not by
  anything structural.
- Neutral, because `onboarded_at` is a column and not a preferences table.
  There are no other per-user preferences today: currency and locale are
  compile-time constants and the theme is in `localStorage`. A table can be
  added when there is a second thing to put in it.
- Neutral, because existing accounts are backfilled as already onboarded, so
  this ships invisible to the one live account.

## Confirmation

`npm run check` covers the route: `app/api/v1/profile/route.test.ts` asserts
that `onboarded: true` stamps a server-side timestamp, that a client-supplied
one is ignored, and that `onboarded: false` is not an instruction — nothing in
the app puts an account back in front of the wizard.

The flow itself needs a signed-in browser pass, which no agent session in this
repo has been able to do (see `STATE.md`). The check is: set `onboarded_at` to
null for an account, load `/dashboard`, and confirm it lands on `/welcome`,
that each step saves, that Skip never writes, and that after finishing the
screen never returns.

## Related

- Supersedes nothing. Closes the open consequence in ADR-0006.
- Decisions: `0006-generated-username-at-signup.md`,
  `0007-shared-form-components-over-css-classes.md`,
  `0025-profile-avatar-upload.md`, `0014-cache-assembled-collection.md`
- Feedback: `docs/feedback/0005-add-card-should-be-one-search-bar.md`,
  `docs/feedback/0006-add-card-no-manual-entry-escape-hatch.md`
- Code: `app/welcome/page.tsx`, `app/components/Onboarding.tsx`,
  `app/components/AvatarPicker.tsx`, `app/(app)/layout.tsx`,
  `lib/core/collection.ts`, `lib/api/viewer.ts`,
  `supabase/migrations/20260816090000_profile_onboarded.sql`
