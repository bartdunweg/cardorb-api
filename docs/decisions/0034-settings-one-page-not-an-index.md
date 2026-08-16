---
id: ADR-0034
title: Settings is one full-width page with every section stacked, not an index of four sub-routes
status: accepted
date: 2026-08-16
scope: repo
deciders: [Bart]
superseded-by: null
tags: [settings, navigation, information-architecture, routing]
---

# Settings is one full-width page with every section stacked, not an index of four sub-routes

## Context and problem statement

`/settings` was an index of four link rows — Profile, Account, Import,
Appearance — each a route of its own under `app/(app)/settings/`, inside a
layout that clamped the whole screen to `max-w-[640px] mx-auto`. That shape was
deliberate: the index page's doc comment argued a redirect to
`/settings/profile` "would mean the address the navigation points at is not a
place — you would press Settings and land on Profile, with no way to see what
else there is."

It answered the wrong question. Knowing *what exists* is worth one screen only
if seeing the actual settings is cheap, and it wasn't: every setting cost a
navigation and a back press, and nothing about the account was ever on screen at
once. Bart's words (FB-0007): "niet iedere keer vier cards die je per card moet
open klikken … dat moet gewoon in één keer zichtbaar zijn." The centred narrow
column compounded it — the screen read as a separate place rather than as one of
the app's screens, which is the other half of the complaint.

The whole thing is four groups totalling twelve panels for a single-owner app.
That is a page, not a section of the site.

## Considered options

1. **Keep the index, make each row expand in place (accordion)** — rejected: it
   is still a click per section, which is the specific thing being complained
   about, and it adds open/closed state that has to be remembered across visits
   to not be worse than the links.
2. **Keep the sub-routes and add a tab strip across the top** — rejected: same
   cost, just relocated. It also drags the screen further from the shape of
   Dashboard/Collection, which was the second half of the ask.
3. **One page, all four groups stacked, each under its own `<h2>`, full width
   like the other screens** — chosen. Sub-routes deleted and redirected.
4. **One page, but keep the 640px centred column** — offered as an option and
   declined by Bart in favour of full width.

## Decision

`app/(app)/settings/page.tsx` is the whole screen. It fetches what the four
sub-pages fetched — `currentViewer()`, `ownProfile()` and `recentImports()`, the
last two in one `Promise.all` on one Supabase client — and renders
`ProfileSettings`, `AccountSettings`, `ImportSettings` and `AppearanceSettings`
in a `flex flex-col gap-8` stack. The four client components are unchanged.

- New `SettingsSection` in `app/components/SettingsPanel.tsx`: a `<section
  aria-labelledby>` with the same `<h2>` style the era groups on
  `/collection/sets` use. `SettingsPanelTitle` became an `<h3>`, since every
  panel now sits under a group heading. `SettingsRowTitle`/`SettingsRowBlurb`/
  `settingsRowClassName` were deleted with the index they existed for.
- `app/(app)/settings/layout.tsx` is gone; it wrapped a single page and carried
  the 640px clamp. Its header (title + email) moved into the page.
- `app/(app)/settings/{profile,account,import,appearance}/` deleted;
  `next.config.ts` redirects all four to `/settings`, permanent.
- `/settings/password` is untouched and still lives outside the shell at
  `app/settings/password/` — it is reached from an unauthenticated recovery
  link as well as from the Account panel (see `STATE.md`).
- `SettingsInput` and Appearance's radio row are capped at `max-w-[26rem]`. The
  panels span the pane; the fields inside them should not, or an email field
  becomes 900px of target.

## Consequences

- Good, because every setting is one scroll away and the screen now has the same
  shape as Dashboard/Collection/Sets: `.cards-main-title`, then `<h2>` sections.
- Good, because the page does one round of fetching for what used to be four
  page loads, and moving between sections stops being a navigation at all.
- Bad, because `/settings` is now a heavier first render than the old index —
  profile, import history and the whole Account/Import UI arrive whether or not
  you came to change your theme. At twelve panels for one user this is not worth
  a `loading.tsx` or a deferred section; if the page grows, that is the first
  thing to revisit.
- Bad, because the deep links are gone: `/settings/appearance` was an address
  worth having and is now a redirect to the top of a page. The `<h2>`s carry
  `id`s (`profile-heading` and friends) so a fragment link remains possible if
  it is ever wanted.
- Neutral, because "Delete this account" left the Account group: on one page it
  would have sat between an email field and a theme picker, so it is its own
  section, last, in `DeleteAccountSettings.tsx`. It keeps its danger border and
  its type-your-username confirmation, which is what actually guards it.
  (Written first with the panel left in place mid-page; moved within the same
  session, before this record was committed, at Bart's request.)
- Neutral, because the Appearance panel lost its own title — the group heading
  above it already says the word once.

## Confirmation

`npm run check` green (typecheck, 339 tests, lint). `app/routes.test.ts`'s
guard-the-guard assertion moved from `/settings/profile` to `/settings` plus
`/settings/password`. The four redirects verified live against `npm run dev`:
`/settings/{profile,account,import,appearance}` each answer `308` to
`/settings`; `/settings` and `/settings/password` still redirect a signed-out
visitor to `/login?next=…`.

Not verified signed in: this workspace has no session and browser automation
cannot create one (the same gap `STATE.md` already records for the tabbar work).
The signed-in pass — all four groups on screen, one control exercised per group,
and the widths at ≥1000px / 641–1000px / ≤640px — is still open.

## Related

- Feedback: FB-0007 (`docs/feedback/0007-settings-should-be-one-page-not-four-cards.md`)
- Supersedes: no ADR — the rationale it reverses lived only in the doc comment
  of `app/(app)/settings/page.tsx`, quoted above so it is not lost with the file.
- Related: ADR-0010 (the 640/641 breakpoint split), ADR-0009 (the settings
  Tailwind migration these panels came out of)
- Changelog: `docs/changelog.d/2026-08-16-settings-one-page.md`
