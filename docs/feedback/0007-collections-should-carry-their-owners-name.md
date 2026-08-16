---
id: FB-0007
date: 2026-08-16
source: Bart
source-type: stakeholder
severity: 3
sentiment: negative
status: addressed
tags: [accounts, profile, signup, seo, multi-user]
---

# Every collection is called "Bart's"; it should carry the name of the person it belongs to

## What was said

> "Iedere collectie heet nu Barts Collection, maar die moet natuurlijk de
> collectie heten van de persoon, de naam van de persoon.
>
> Dus als je je aanmeldt, dan heb je misschien een naam en dan moet de
> gebruikersnaam gegenereerd worden zoals het nu ook al is.
>
> Maar dan moeten dat gebruikersnamen zijn. Nou, tenminste, ik denk dat je ook in
> de instellingen bij de aanmelding misschien een naam moet kunnen opgeven.
>
> Denk even na over hoe je dat het beste kunt laten werken."

English: "Every collection is now called Bart's Collection, but of course it
should be called the collection of the person — the person's name. So when you
sign up you maybe have a name, and then the username should be generated the way
it already is. But then those should be usernames. Well, at least, I think you
should maybe also be able to give a name in settings, at signup. Have a think
about how best to make that work."

And, asked whether a name should be one field or first name plus last name:

> "Je hebt dus een username. Ik weet niet of het gebruikelijk is, maar je kunt je
> voornaam en achternaam opgeven als het gebruikelijk is."

English: "So you have a username. I don't know if it's customary, but you can
give your first and last name if that's what's customary."

## Context

The app went multi-user — accounts, `profiles`, per-user card rows, row level
security — but the *name* on a collection never followed. `OWNER_NAME`, an env
var defaulting to `"Bart"` in `lib/core/config.ts`, was read by nine render
sites. A second account with a public page therefore got its own cards under the
deployment owner's name: in the `<title>`, the OG image, the JSON-LD, the rail
heading, and in "Signed in as Bart" on the landing header while somebody else was
signed in. Production had exactly this case live — a second public profile,
`pikachu`, whose page was titled "Bart's Pokémon card collection".

## Interpretation

Two separate asks, and Bart is right that they are separate:

1. A **name** (what the collection is called) and a **username** (the handle in
   `/user/<name>`) are different things, and the app was conflating them —
   `display_name` existed but signup seeded it with the generated username, so
   "swift-eevee-4821" was indistinguishable from a name somebody chose.
2. The generated username stays generated (ADR-0006 is not being reversed); the
   name is the thing worth asking for, and it should be askable both at signup
   and in Settings.

On first-name/last-name: Bart is asking what is customary rather than stating a
preference, so this is a judgement call made on his behalf. One free-text field
is what consumer products do (GitHub, Instagram, X); a first/last split exists to
serve billing and shipping, neither of which this app has, and it asks anyone
whose name does not divide in two to pretend that it does. Recorded as an
assumption in ADR-0034, open to being reversed.

## Action

- [x] `display_name` is the person's name, asked for (optionally) at signup and
      editable in Settings as "Your name"; every public render site reads it via
      `ownerLabel()`, falling back to the username. `OWNER_NAME` and
      `PUBLIC_USERNAME` deleted. See ADR-0034.

## Related

- Decision: ADR-0034
- Extends: ADR-0006 (generated username at signup) — closes the discoverability
  gap that record explicitly left open
- Changelog: `docs/changelog.d/2026-08-16-collection-named-after-its-owner.md`
