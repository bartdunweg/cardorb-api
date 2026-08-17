---
id: ADR-0051
title: Screenshots before finishing the cards.css migration, not after
status: accepted
date: 2026-08-17
scope: repo
deciders: [Bart]
superseded-by: null
tags: [tailwind, css, testing, playwright, migration]
---

# Screenshots before finishing the cards.css migration, not after

## Context and problem statement

`app/styles/cards.css` is 1,300 lines: 35 classes, all thirty-five still used,
zero dead. Whether to finish moving it to Tailwind was asked and answered twice
in one session, both times too quickly — first "the migration is unfinished", then
"leave it, CSS does this better". Measuring settled it, and neither answer was
right.

**Tailwind 4 can express nearly all of it.** The thirteen media queries become
`max-lg:`/`min-*:`, `prefers-reduced-motion` becomes `motion-reduce:`, the eight
pseudo-element rules become `before:`/`after:`, the container query and the three
`:has()`/`:not()` rules have direct variants. One `@keyframes` genuinely belongs
in a stylesheet and would stay.

**What makes it hard is not expressiveness but shape.** Forty of the selectors are
descendants — `.a .b` — which style a child from the parent's class. Moving one
means putting the class on the child, which means editing markup rather than
moving a rule. That is precisely where this migration has failed before:

- **ADR-0012** — a cascade-layers bug meant every Tailwind margin and padding
  added since the migration began was silently losing to legacy CSS. Unnoticed
  because `gap` was unaffected, so the screenshots looked fine.
- **ADR-0017** — an unconditional Tailwind property beat a still-CSS conditional
  reset.
- **ADR-0018** — a class had a second consumer (`loading.tsx`) nobody remembered.
- **ADR-0020** — a dialog's inputs silently lost their glass styling, found in a
  later audit, because the route needs a session.

Four attempts, four failures, and **not one of them was visible to `npm test`,
`tsc` or `eslint`**. None of those tools can see a margin that stopped applying.

## Considered options

1. **Build a visual-regression harness first, then migrate in portions.**
2. **Migrate now**, carefully, reviewing diffs.
3. **Never migrate**; declare cards.css the permanent home for these 35 classes.

## Decision

(1). `visual/cards-css.spec.ts` under Playwright, run by `npm run visual:baseline`
before a change and `npm run visual` after.

Three widths, chosen to straddle the two breakpoints cards.css actually uses —
390 (below 640), 800 (between 641 and 1000), 1280 (above 1001) — rather than to
match any device. A migration that drops a media query is invisible at a width
that never triggered it.

**Deliberately not part of `scripts/verify.sh` and not a CI gate.** The pages
render live Cardmarket prices, which move nightly, so a committed baseline would
be red by morning through nothing anyone did — and a check that cries wolf is
ignored inside a week. Baselines are gitignored for the same reason: they are a
working artefact of one migration sitting, not a fact about the project.

(2) was rejected on the record above. Reviewing a diff is what was done the
previous four times.

(3) was rejected because the split is a real cost: a component's styling
currently lives in two places, and a reader has to check both.

## Consequences

- Good, because **it was tested by breaking something**. A single
  `margin-bottom: 37px` added to `.cards-head` produced 96,194 differing pixels
  (0.28 of the image) on all three widths of the profile, while both marketing
  pages stayed green because they do not use that class. A harness nobody has
  seen fail is not a safety net.
- Good, because it is cheap: 17 seconds for nine screenshots.
- Bad, and this is the limitation to read before trusting it: **`/collection`,
  `/dashboard` and the add-card dialog are not covered**, because they need a
  session this harness has no credentials for. `/user/<name>` renders the same
  `CardsView` publicly, so most of cards.css is exercised — but every owner-only
  branch of that component is not. ADR-0020 is exactly a bug that hid behind a
  login. A green run means "the public half did not move", not "the migration is
  safe".
- Bad, because prices are masked, so a layout change *within* a price element is
  not compared. The alternative was a baseline with a one-day shelf life.
- Neutral, because Playwright and one Chromium are now a dev dependency.

## Confirmation

- 9 baselines taken and re-verified green.
- Sabotage test as above: caught on the three widths that render the class,
  ignored on the three pages that do not.
- Not confirmed: anything behind a login. Adding a stored session for a test
  account is the single change that would close that, and it is the next thing
  worth doing if the migration goes ahead.

## Related

- Guards: ADR-0012, ADR-0017, ADR-0018, ADR-0020 — the four failures this exists
  to make visible
- Code: `playwright.config.ts`, `visual/cards-css.spec.ts`, `package.json`
  (`visual`, `visual:baseline`)
