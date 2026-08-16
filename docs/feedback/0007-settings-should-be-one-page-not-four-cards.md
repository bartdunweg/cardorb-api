---
id: FB-0007
date: 2026-08-16
source: Bart
source-type: stakeholder
severity: 3
sentiment: negative
status: addressed
tags: [settings, ux, navigation, desktop]
---

# Settings should be one ordinary page with every section visible, not four cards you click open

## What was said

> "De settingspagina is op de desktop een aparte pagina, maar dat moet gewoon een
> pagina zijn zoals de andere.
>
> Nu moet je iedere tab open klikken, maar zet alle secties maar gewoon onder
> elkaar.
>
> Dus niet iedere keer vier cards die je per card moet open klikken; daar heb ik
> geen zin in.
>
> Dat moet gewoon in één keer zichtbaar zijn."

English: "On desktop the settings page is a separate page, but it should just be
a page like the others. Right now you have to click each tab open — just put all
the sections underneath each other. So not four cards every time that you have to
click open per card; I don't feel like it. It should just be visible in one go."

## Context

`/settings` was an index of four link rows — Profile, Account, Import, Appearance
— each leading to its own sub-route (`app/(app)/settings/<section>/page.tsx`).
The index's own doc comment argued for that shape explicitly: "A redirect would
mean the address the navigation points at is not a place." Changing a display
name and then the theme cost two navigations and two back presses, and the
640px centred column made the screen read as separate from Dashboard/Collection
even though it has been inside the app shell since the move recorded in
`STATE.md`.

## Interpretation

Two complaints in one, and both are about the same thing — settings is not a
place you visit, it is a thing you scan:

1. **Structure**: four click-through cards → one page, all sections stacked.
   "Open klikken" describes the link rows; there is no accordion in the code, so
   this is about the navigation cost, not a collapse animation.
2. **Chrome**: it should look like the other screens. Asked to choose, Bart
   picked full width like Dashboard/Collection over keeping the centred readable
   column, and keeping an `<h2>` per group with its cards underneath.

Not a request to merge the four groups into one undifferentiated wall of cards —
the group headings stay.

## Action

- [x] `/settings` renders Profile, Account, Import and Appearance in one column;
      the four sub-routes are deleted and redirected to `/settings`; the 640px
      clamp and the single-page layout wrapper are gone. See ADR-0034.

## Related

- Decision: ADR-0034
- Changelog: docs/changelog.d/2026-08-16-settings-one-page.md
- Code: `app/(app)/settings/page.tsx`, `app/components/SettingsPanel.tsx`,
  `next.config.ts`
