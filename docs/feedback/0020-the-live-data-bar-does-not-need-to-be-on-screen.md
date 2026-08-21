---
id: FB-0020
date: 2026-08-21
source: Bart
source-type: stakeholder
severity: 2
sentiment: negative
status: addressed
tags: [development-environment, interface, safety]
---

# The "Live data" bar does not need to be on screen while testing

## What was said

> Krijgt de header bij het testen deze melding, maar dat hoeft niet in beeld te
> staan. Heb je dat toegevoegd? Is dat nog nodig? Van wat mij betreft niet echt.
> Live data.
> This development server writes to the real database (fprjroupecdhosfdrqhv).
> Anything you save here is saved on cardorb.com.

English: *"The header shows this message while testing, but it doesn't need to be
on screen. Did you add that? Is it still needed? As far as I'm concerned, not
really."* — followed by the bar's own text, quoted back.

## Context

`components/custom/LiveDataWarning.tsx`, rendered in `app/layout.tsx` as the
first child inside `<ThemeProvider>`, so it sat at the top of every route. It was
a sticky, full-width red bar naming the Supabase project ref and the site URL.

It rendered only in `npm run dev` against the hosted database: `NODE_ENV ===
"production"` returned `null`, and so did a local Supabase stack on `127.0.0.1`.
No visitor to cardorb.com ever saw it.

It shipped earlier the same day, in commit `df0c4f0` (PR #106), as point 2 of
ADR-0076 — after production was found serving an indexed public page titled
*"UI test 2416's Pokémon card collection"*.

## Interpretation

Two separate things were said, and both are fair.

- **"Did you add that?"** — it was not asked for. It arrived as part of a quality
  sweep, and a full-width red bar on every page is a large thing to add without
  asking, which the repository's own rules say to ask about.
- **"Is it still needed?"** — the bar cost attention on every page for the life of
  the project, and paid it back only on the rare occasion somebody was about to
  type into a live form without realising. ADR-0076 called it "intrusive by
  design"; that design is what is being rejected.

The risk it warned about has not gone away. There is still one Supabase project
and `npm run dev` still writes to it. But a warning the owner does not want is
not a safety measure that survives contact with daily work, and pretending
otherwise just makes the next one easier to ignore.

## Action

- [x] Delete `components/custom/LiveDataWarning.tsx` and unwire it from
      `app/layout.tsx`.
- [x] Record the removal and what it knowingly accepts (ADR-0084).
- [ ] Still open, and now the only mitigation left: point 3 of ADR-0076 — move
      the screenshot harness off the real owner account.

## Related

- Decision: ADR-0076 (`0076-one-database-warned-about-not-two.md`) — where the
  bar came from, and the two points of it that still stand.
- Decision: ADR-0084 (`0084-the-live-data-bar-comes-off.md`) — the removal.
- Changelog: none. The bar never rendered in a production build, so nothing
  user-visible changed.
