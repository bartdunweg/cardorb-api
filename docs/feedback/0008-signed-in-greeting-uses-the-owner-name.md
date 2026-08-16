---
id: FB-0008
date: 2026-08-16
source: Bart
source-type: stakeholder
severity: 3
sentiment: negative
status: addressed
tags: [accounts, copy, landing, multi-user]
---

# "Signed in as Bart" is shown to everybody, not just Bart

## What was said

> "Het is ook zo dat als je ingelogd bent, dan staat er "Sign in as Bart". Maar
> dan moet het natuurlijk ook gewoon "Sign in as" en dan de username of de naam
> van het profiel zijn, want ze heten niet allemaal Bart. Ik had Bart gezegd als
> voorbeeld."

English: "Also, when you're logged in it says 'Sign in as Bart'. But of course it
should just be 'Sign in as' and then the username or the profile's name, because
they're not all called Bart. I'd said Bart as an example."

## Context

`app/page.tsx` (the landing page navbar, signed-in state) rendered
`Signed in as {OWNER_NAME}` and used `OWNER_NAME.charAt(0)` for the avatar
fallback initial. `OWNER_NAME` is `process.env.OWNER_NAME ?? "Bart"` — a
deployment-level constant from when this app had exactly one account. It is
correct for the person the deployment is named after and wrong for every other
account that has signed up since.

## Interpretation

Not a copy tweak: the greeting has to come from the signed-in viewer, and Bart
named the fallback order himself — the profile's name first, the username
otherwise. "Ik had Bart gezegd als voorbeeld" is a pointed clarification that
the owner's name is not a stand-in for "the user" anywhere in this app.

The same class of bug survives elsewhere and is *not* fixed here: the public
collection page still titles itself `${OWNER_NAME}'s Pokémon card collection`,
and `CardsView`/`CardsSidebar` still label a public collection the same way.
That is a bigger thread (metadata, the OG image, two components' props) and is
recorded as a follow-up rather than folded in silently.

## Action

- [x] `Viewer` carries `displayName`; new `displayNameOf()` gives the fallback
      order (chosen name → username → the address's local part). The landing
      navbar and its avatar initial both read it. See ADR-0035.
- [ ] Follow-up: the public collection's own naming (`/user/[username]` title
      and OG image, `CardsView.tsx:939`, `CardsSidebar.tsx:72`) still uses
      `OWNER_NAME`.

## Related

- Decision: ADR-0035
- Changelog: `docs/changelog.d/2026-08-16-signed-in-greeting-uses-your-name.md`
- Code: `lib/api/viewer.ts`, `app/page.tsx`
