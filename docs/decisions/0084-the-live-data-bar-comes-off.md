---
id: ADR-0084
title: The live-data bar comes off, and the risk it warned about is accepted openly
status: accepted
date: 2026-08-21
scope: repo
deciders: [Bart, Claude]
supersedes: ADR-0076 (point 2 only)
superseded-by: null
tags: [development-environment, data, safety, interface]
---

# The live-data bar comes off, and the risk it warned about is accepted openly

## Context and problem statement

ADR-0076 was written this morning. It had three points; the second one added a
sticky red bar to the top of every page of the development server, saying that
this server writes to the real database.

By the afternoon the owner had used it and said so (FB-0020):

> Krijgt de header bij het testen deze melding, maar dat hoeft niet in beeld te
> staan. Heb je dat toegevoegd? Is dat nog nodig? Van wat mij betreft niet echt.

*"The header shows this message while testing, but it doesn't need to be on
screen. Did you add that? Is it still needed? As far as I'm concerned, not
really."*

Two things are true at once, and that is the whole of this record:

- **The bar was not asked for.** It arrived inside a quality sweep. This
  repository's own rules say to ask before making a real change, and a
  full-width red bar on every page is a real change.
- **What it warned about is still true.** There is one Supabase project.
  `.env.local` points `npm run dev` at the project production uses. A form filled
  in on localhost is a form filled in on cardorb.com, exactly as ADR-0076
  described.

## Decision

**Remove it. Do not replace it with a smaller version of itself.**

- `components/custom/LiveDataWarning.tsx` is deleted.
- Its import and its element are removed from `app/layout.tsx`. The
  `Skip to content` link is the first child inside `<ThemeProvider>` again.
- **Point 2 of ADR-0076 is superseded, and only point 2.** Point 1 — the
  `display_name` row emptied rather than filled with the username — is done and
  stands. Point 3 — moving the screenshot harness off the real owner account
  onto a test account with a copied collection — was agreed and never built, and
  is now the only mitigation left.

## Alternatives considered

Both were offered at the moment of the decision and both were declined, in
favour of removing it outright.

- **A small badge in a corner instead of a bar.** It would have kept a reminder
  without pushing the page down. Declined: the objection was to having it on
  screen at all, and a badge small enough not to be in the way is a badge small
  enough not to be read. It would have been the worst of both — still there,
  still costing attention, no longer doing the job the bar's size was the whole
  point of.
- **Keep it, hidden behind an environment flag.** Declined for the same reason a
  dev database was declined in ADR-0076: a safeguard that has to be switched on
  by the person it is meant to protect is not a safeguard. Nobody would set the
  flag, and the code would sit there implying a protection that was off.
- **Leave it as it is.** Declined, obviously, but worth writing down that it was
  a real option. A safety measure the owner actively does not want is not a
  safety measure. It gets ignored, then it makes the next warning easier to
  ignore too.

## Consequences

- **The risk is accepted, not solved.** `npm run dev` still writes to the
  production database, and from today nothing on screen says so. Anyone reading
  this record should assume that any form they fill in locally is live.
- **Point 3 of ADR-0076 matters more than it did.** It was the belt to the bar's
  braces; it is now the only thing standing between a screenshot run and the
  real owner's profile. It is still not built.
- **Nothing user-visible changed**, so there is no changelog fragment. The
  component returned `null` when `NODE_ENV === "production"` and tree-shook out
  of every real build; no visitor to cardorb.com ever saw the bar.
- **This is the second correction to ADR-0076's work in one day**, and the reason
  is not that the reasoning was wrong — it reads well. It is that the change was
  made without asking. The lesson is about the asking, not about the analysis.

## Related

- `docs/feedback/0020-the-live-data-bar-does-not-need-to-be-on-screen.md` — the
  feedback, quoted in full.
- `docs/decisions/0076-one-database-warned-about-not-two.md` — the record this
  partially supersedes. Its points 1 and 3, its rejection of a separate dev
  database, and its rejection of blocking writes from localhost all still hold.
