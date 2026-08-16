---
id: ADR-0035
title: The viewer carries a display name, and screens greet people with it instead of OWNER_NAME
status: accepted
date: 2026-08-16
scope: repo
deciders: [Bart]
superseded-by: null
tags: [accounts, viewer, copy, multi-user]
---

# The viewer carries a display name, and screens greet people with it instead of OWNER_NAME

## Context and problem statement

The landing page's signed-in navbar said `Signed in as {OWNER_NAME}` — a
deployment constant (`process.env.OWNER_NAME ?? "Bart"`) from when this app had
one account. Every person who has signed up since was greeted by the owner's
name, and the avatar fallback drew the owner's initial over their own account
(FB-0008: "ze heten niet allemaal Bart").

The obstacle was that `Viewer` (`lib/api/viewer.ts`) carried `username` and
`avatarUrl` but not the display name — the field ProfileSettings calls "What the
public page calls you" — so a screen wanting to greet somebody properly had
nothing to greet them with.

## Considered options

1. **Greet with `viewer.username`** — no code beyond swapping the constant, but
   it shows `ash-k` to somebody who deliberately set their name to "Ash Ketchum".
   The display name exists precisely to be the human-readable one.
2. **Fetch the profile separately wherever a name is shown** — a second round
   trip per screen for a column the viewer query is already positioned to read.
3. **Add `display_name` to the select `viewerFrom()` already runs, expose it as
   `Viewer.displayName`, and give the fallback chain one exported helper** —
   chosen. One extra column on an existing query, no extra request.

## Decision

`Viewer` gains `displayName: string | null`, read from the `profiles` select
that was already fetching `username,avatar_url`. `displayNameOf(viewer)` is
exported alongside it and returns the chosen name, falling back to the username,
then to the local part of the email address, then to "your account".

The fallback chain is a function rather than `displayName || username` written
at each call site, because that expression is what quietly differs between call
sites: a display name of `"   "` is truthy and renders as an empty greeting, and
the profile-less state `viewerFrom()` tolerates has no username either. Covered
by `lib/api/viewer.test.ts`.

`app/page.tsx` uses it for both the greeting and the avatar's fallback initial.
Two `Viewer` object literals outside `viewerFrom()` — the deprecated
`x-cards-key` path in `guard.ts`, and `guard.test.ts`'s fixture — set
`displayName: null`.

## Consequences

- Good, because the greeting is now the viewer's own, and any future screen that
  needs to name somebody has one obvious, tested way to do it.
- Good, because it cost no additional query: the column rides along on the
  profile read every authorised request already makes.
- Bad, because `OWNER_NAME` is still the name on the public collection —
  `/user/[username]`'s title and OG image, `CardsView.tsx:939` and
  `CardsSidebar.tsx:72` all say "Bart's collection" whoever's collection it is.
  This ADR deliberately does not fix that: it is metadata, an OG image and two
  components' props, and it is tracked as the open item on FB-0008. Anyone
  reading this file for "is the owner-name assumption gone" should read that
  sentence as "no, not yet."
- Neutral, because `OWNER_NAME` remains correct where it is used as the site's
  authorship (`app/layout.tsx`'s `authors`, the landing page's JSON-LD): those
  describe who made the deployment, not who is looking at it.

## Confirmation

`npm run check` green — 344 tests, including five new ones covering the fallback
order (chosen name, missing name, whitespace-only name, no profile row, nothing
at all). Not seen in a browser: the greeting only renders signed in, and this
workspace has no session and no connected browser extension.

## Related

- Feedback: FB-0008
- Code: `lib/api/viewer.ts`, `lib/api/viewer.test.ts`, `app/page.tsx`,
  `lib/api/guard.ts`
- Changelog: `docs/changelog.d/2026-08-16-signed-in-greeting-uses-your-name.md`
