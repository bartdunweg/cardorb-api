---
id: ADR-0043
title: Terms of use at /terms — written for the operator, not for Apple
status: accepted
date: 2026-08-16
scope: repo
deciders: [Bart]
superseded-by: null
tags: [legal, terms, liability, trademark, pricing, routes]
---

# Terms of use at /terms — written for the operator, not for Apple

## Context and problem statement

ADR-0042 shipped `/privacy` and closed by noting that no `/terms` existed,
because Apple's standard EULA applies to an app that supplies none. Bart asked
for one anyway, and gave the reason: *"Moeten we termen ook niet gewoon hebben?
Ja, dat hoeft dan niet specifiek voor Apple, maar gewoon voor überhaupt voor
onszelf."*

That reframes the document. A privacy policy is written for the user; terms of
use are written for the operator. The question is therefore not "what does Apple
require" but **what is this specific product exposed to**, and three answers came
out of looking at it rather than from a template.

## Decision

Publish `/terms`, covering the website and the app, in the same shell as
`/privacy`. Three sections carry the actual weight:

**1. Prices are information, not advice.** This app puts a euro figure beside
every card and totals a collection. That is precisely the shape of thing someone
treats as a valuation unless told otherwise — and the figures are Cardmarket
observations that know nothing about a card's condition, its edition, or what a
buyer would really pay today. The section says so in its own heading and repeats
the operative sentence in bold. This is the single largest exposure the product
has, and it is not a clause any standard EULA supplies.

**2. Not affiliated with The Pokémon Company, Nintendo, Game Freak or
Creatures.** The product was renamed away from "Pokebinder" for exactly this
reason — `lib/core/config.ts` records it: *"A tool for one person can borrow a
word. A product taking accounts cannot."* The rename removed the trademark from
the name; this section is the other half of the same decision, and says what the
card names and artwork are doing here (identifying cards, the way a catalogue
does).

**3. It is free, and it can stop.** A free service run by one company has to be
able to change or shut down. Paired with a promise of reasonable notice and a way
to get the collection out first.

The rest is ordinary: account responsibility, 16+, what you may not do
(scraping the catalogue and other people's public collections is named, since
the public endpoints are deliberately open — see `CLAUDE.md`), your collection
stays yours, liability limited as far as Dutch law allows with consumer rights
expressly preserved, Dutch law and the Rotterdam court.

One section **is** for Apple, at a cost of three sentences: Apple is not a party,
is a third-party beneficiary, and support is ours. A custom EULA on the App Store
is expected to carry that.

## Consequences

- `app/components/LegalPage.tsx` was extracted the moment there were two legal
  pages rather than after they had drifted — the shell (Navbar, the
  `--content-max` article, the `<h1>`, the "Last updated" `<time>`, the Footer)
  plus a `legal` object of type class strings. The repo already settles shared
  styling this way (`tabbarClasses.ts`, `cardsPageClasses.ts`,
  `segmentedClasses.ts`). Each page keeps its own `metadata` export on purpose:
  the `robots`/`canonical`/`openGraph` block genuinely differs per route, and
  hiding it in the shell would hide the one field that must not be wrong.
- The footer carries both links, the signup line names both, and each legal page
  links to the other. `app/routes.test.ts` guards all of it.
- **A claim was caught and corrected before it shipped**: the first draft said
  "the CSV export is there for that". There is no CSV export — it is
  `comingSoon: true` on the landing page, and only *import* is built. The
  sentence now says the export is planned and not built. Worth recording as the
  failure mode rather than the typo: a terms page is written in the register of
  fact, which makes an unchecked assumption read as a promise.

## Not legal advice

Same caveat as ADR-0042, and it matters more here. This document limits
liability and picks a forum; those are the clauses whose wording decides whether
they work. It is honest about what the software does and what is and is not
promised, which is the part that can be verified from inside this repo. Before
it is relied on — and certainly before the app is on sale to the public — it is
worth a professional's read.
