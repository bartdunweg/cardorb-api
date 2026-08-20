---
id: ADR-0057
title: The filled accent is tintLabel, not tint, because it carries a word
status: accepted
date: 2026-08-19
scope: repo
deciders: [Bart]
superseded-by: null
amends: ADR-0055
tags: [accessibility, contrast, tokens, untitled-ui, wcag]
---

# The filled accent is `tintLabel`, not `tint`, because it carries a word

Two accessibility findings from the `build-quality` pass on `/login`, both
introduced by the Untitled UI conversion, both fixed. Lighthouse accessibility
went 96 → 100 on mobile.

## Finding 1 — the primary button failed AA, at exactly the number this repo already wrote down

`--color-brand-600` is what `--color-bg-brand-solid` points at: the filled
accent, and the background of the primary button. It was set to `colour.tint`
(`#007aff`), reasoned as "the filled accent, the same one accent".

White on `#007aff` is **4.02:1**. The button's label is `text-sm font-semibold`
— 14px — which is not WCAG large text, so it wants **4.5:1**. It failed.

The number is not new. `tint`'s own comment in `lib/design/tokens.ts` has said
this from the day it was written:

> `#007aff` measures 4.02:1 on white and 3.87:1 on the page — fine for a shape,
> not for a word.

The mistake was reading "filled accent" as a question about the fill. The
binding constraint is the word on top of it. `tint` is for graphics that carry
no text — a selected pill, a progress bar, a focus ring — and a solid button
with a white label is not one of those.

**Decision:** `--color-brand-600` takes `colour.tintLabel` (`#0066cc`) —
**5.57:1**, passes. `--color-brand-500` stays `tint`: it is
`--color-border-brand`, the focus ring, a graphic wanting 3:1, and 4.02 clears
it. 600 and 700 are now equal, which is not a slip: once a surface carries text,
this app has one blue for it.

The visible cost is that the primary button is a shade deeper than iOS system
blue. That is the cost of the label being readable, and it is the same trade
`tintLabel` was created to make for links.

**Why this was not caught earlier:** ADR-0055 permits Card Orb's value where it
is "argued from a measurement". `tint` *is* argued from a measurement — the
wrong one for this use. A cited measurement is not the same as the applicable
measurement, and the rule should be read that way from here on.

## Finding 2 — the password reveal toggle was a 16×16 touch target

Untitled UI sizes that button to its icon. WCAG 2.2 AA (2.5.8) asks 24×24;
Lighthouse flagged it as `target-size`.

**Decision:** the button gets `size-6` (24px), appended after
`sizes[inputSize].iconTrailing` so tailwind-merge drops the `size-4` that class
brings. The icon inside stays 16px and is centred, so only the hit area grows.

**An `::after` overlay was tried first and does not work.** It grows what is
clickable but not the element's box, and `target-size` measures the box. It
looked right in the diff and failed the audit it was written for — worth
recording, because the next person will reach for the same trick.

This is a **vendored** edit, so `npx untitledui add` overwrites it.
`scripts/untitled-add.mjs` re-applies it, alongside the two fixes ADR-0054
already listed.

## Consequences

- Three patches now live in `scripts/untitled-add.mjs`, and each one is a place
  where this repository disagrees with upstream's template. If that list grows
  much past three, the disagreement is with the library rather than the
  template, and that is worth reconsidering rather than automating further.
- The accent-blue change is user-visible and has a changelog fragment.
- `--color-brand-500` and `--color-brand-600` are now different values, so the
  focus ring and the button fill are no longer the same blue. Deliberate: one is
  a graphic, the other is a text background.

## Confirmation

Lighthouse, mobile, `next start` on the production build:

| | Before | After |
|---|---|---|
| Accessibility | 96 | **100** |
| `color-contrast` | — | pass |
| `target-size` | fail (16×16) | pass |

The two remaining Lighthouse failures are not this change and are not defects:
`errors-in-console` is `/_vercel/insights/script.js` 404-ing because Vercel Web
Analytics is not served by a local `next start`, and `is-crawlable` is
`/login`'s own `noindex, nofollow` doing its job. An SEO score of 63 is the
intended result on a login.

Dark mode rendered rather than reasoned about: `prefers-color-scheme: dark` with
**no** `data-theme` attribute — the case the bridge in `gen-tokens.mjs` exists
for — gives dark fields with light labels, not Card Orb's dark surfaces under
Untitled UI's light text.

Screenshot harness: nine screenshots across `/user/:name`, `/` and `/app/ios`
still identical. `./scripts/verify.sh` exits 0 — 478 tests in 41 files.

## Related

- ADR-0055 — the rule this amends the reading of.
- ADR-0054 — the two vendored fixes this adds a third to.
- ADR-0056 — the other thing the proof screen caught.
