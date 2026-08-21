---
id: ADR-0073
title: The landing page's title says what the thing does, not just what it is called
status: accepted
date: 2026-08-21
scope: repo
deciders: [Claude, on a full-repository SEO review]
superseded-by: null
tags: [seo, metadata, copy]
---

# The landing page's title says what the thing does, not just what it is called

## Context and problem statement

`https://cardorb.com/` rendered `<title>Card Orb</title>`. Verified live.

That was deliberate, and the reasoning was sound. `app/layout.tsx` sets a title
template of `%s · Card Orb`, so a page titled "Card Orb" would render as
"Card Orb · Card Orb". `app/page.tsx` used `title: { absolute: APP_NAME }` to
opt out of the template, and the layout's own comment names the intent:

> The two pages that are mostly the name itself opt out with `title.absolute`,
> which is what that field is for.

The escape from the doubling was right. The string chosen to escape *to* was
not. For a brand nobody is searching for yet, a `<title>` containing no words
anyone types is the weakest possible signal on the one page carrying the whole
site's authority. The page's own `<h1>` ("Track your Pokémon card collection.")
and its description are both good; the title was the outlier.

The layout already held a better string, as `title.default`:
`Card Orb — your Pokémon card collection, sorted`. Because `app/page.tsx` set
`absolute`, that default was never used by any route — it existed and was dead.

Found alongside: the `keywords` array on the same page does nothing. Google has
ignored `<meta name="keywords">` since 2009.

## Decision

**`APP_TITLE` in `lib/core/config.ts` is the name with enough of a sentence
attached to be findable:** `Card Orb — track your Pokémon card collection`.

`title: { absolute: APP_TITLE }` — `absolute` stays, because the template would
still double the name. The og:title and twitter:title on the same page read the
same constant, so the three cannot disagree.

## Alternatives considered

- **Drop the `title` key entirely and let the layout's `default` through.**
  Would have worked and is one line shorter. Rejected because it makes the
  landing page's title an inherited side effect rather than a stated choice, and
  because the next person editing `layout.tsx`'s `default` would be silently
  editing the landing page's `<title>` without knowing it.
- **Keep the bare name.** Defensible for a brand people already search for by
  name. Card Orb is not that, and the point of the page is being found by people
  who have never heard of it.
- **Also remove `keywords`.** Correct — it is inert — but it is inert, not
  harmful, and deleting it is a separate tidy-up rather than part of a title
  fix. Named as follow-up.

## Consequences

- The one indexable page carrying the site's authority now contains the words
  someone would actually type.
- `lib/core/config.ts` gained a third name-ish constant beside `APP_NAME`,
  `APP_TAGLINE` and `APP_TAGLINE_SHORT`. That file is now the place to look for
  all of them, which is the point, but it is four strings that have to stay
  consistent with one another by hand.
- `app/layout.tsx`'s `title.default` is still a near-duplicate of `APP_TITLE`
  and is still unused by any route. Left as is: it is required alongside a
  template, and the two saying nearly the same thing is correct.
- **Not measured:** whether this changes anything in search. That needs Search
  Console, which is not connected — see the note in `STATE.md`.

## Related

- `docs/decisions/0002-subtle-free-european-positioning.md` — the landing page's
  voice.
- `docs/decisions/0034-collection-named-after-its-owner.md` — why a public
  page's title comes from the profile being rendered, not from a deployment-wide
  constant. This decision covers the landing page, which has no owner.
