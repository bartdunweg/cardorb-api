---
id: ADR-0072
title: The site's share picture is a shared constant, because a nested openGraph block replaces the root one
status: accepted
date: 2026-08-21
scope: repo
deciders: [Claude, on a full-repository SEO review]
superseded-by: null
tags: [seo, metadata, next-js]
---

# The site's share picture is a shared constant, because a nested openGraph block replaces the root one

## Context and problem statement

A full SEO review of the live site found `https://cardorb.com/app/ios` shipping
with **no `og:image` and no `twitter:image` at all**. Verified against
production, not just the source: `/`, `/privacy`, `/terms` and `/brand` each
return one; `/app/ios` returns neither, while still setting
`twitter:card: summary_large_image` — a promise that nothing keeps.

The cause is a Next.js rule that is easy to state and easy to forget: **a child
segment's `openGraph` object replaces the parent's rather than merging into
it.** `app/opengraph-image.tsx` sits at the app root and answers for every route
that does not draw its own — but only for routes that do not *declare*
`openGraph` themselves. Declaring one, for any reason, drops the image.

The repository already knew this. `app/privacy/page.tsx` carries a comment
written when the same bug was found and fixed there:

> Anything that declares openGraph in a nested route from now on has the same
> hole.

`/app/ios` was written afterwards, declared `openGraph` for its `url` and
`title`, and fell into the hole the comment describes. **A warning in a comment
in one file did not stop the second occurrence**, which is the part worth acting
on. This is the page whose entire job is to be shared ahead of an App Store
launch; every share of it rendered as a bare text link.

A second, smaller fault sat beside it. `/privacy` and `/terms` passed the image
as the bare string `"/opengraph-image"`. That emits `og:image` alone — no
`og:image:width`, `:height`, `:type` or `:alt`, all of which `/` emits. Scrapers
that will not upgrade to a large card without explicit dimensions render a small
one instead.

## Decision

**One exported constant, `SITE_OG_IMAGE` in `lib/core/og.ts`, is what every
nested route names.** It is the object form, carrying `url`, `width`, `height`,
`type` and `alt`.

`lib/core/og.ts` also owns `OG_IMAGE_ALT`, `OG_IMAGE_SIZE` and `OG_IMAGE_TYPE`,
and `app/opengraph-image.tsx` re-exports its `alt`, `size` and `contentType`
from them. So the dimensions written into the meta tags and the dimensions the
image is actually drawn at come from the same three lines and cannot drift.

## Alternatives considered

- **Fix `/app/ios` and move on.** Rejected. It is what was done last time, and
  the comment left behind did not prevent this occurrence. The failure mode is
  "someone adds a route, declares `openGraph`, and does not know the rule" — a
  constant that is obviously part of the block is a better reminder than prose
  in a neighbouring file.
- **Give `/app/ios` its own `opengraph-image.tsx`.** Genuinely the better answer
  on the merits — it is the one indexable page with a distinct subject, and the
  generic site card undersells it. Not taken here because it is a design task
  (someone has to decide what the picture shows) rather than a metadata fix, and
  the page is currently shipping *nothing*. Named as follow-up work instead.
- **A lint rule that fails when `openGraph` appears without `images`.** Rejected
  as disproportionate for a codebase with five indexable routes, and it would
  fire falsely on the root segment, which correctly declares neither.

## Consequences

- Every share of `/app/ios` now renders a card rather than a bare link.
- `/privacy` and `/terms` emit the full set of `og:image:*` tags.
- A sixth indexable route that declares `openGraph` still has to remember to add
  `images: [SITE_OG_IMAGE]`. This makes that one line short and obvious; it does
  not make it automatic. The check is `grep -rn "openGraph" app/` against
  `grep -rn "SITE_OG_IMAGE" app/`.
- `app/opengraph-image.tsx` now imports from `lib/core/og.ts`. That file is
  static and takes no data, so nothing about its build-time behaviour changes —
  ADR-0035's rules about what renders when are untouched.

## Related

- `docs/decisions/0042-ios-app-page.md` — why `/app/ios` exists and what its
  metadata is for.
- `docs/decisions/0042-one-privacy-policy-for-app-and-site.md` — the five
  indexable routes.
- `docs/decisions/0035-og-image-is-dynamic-not-revalidated.md` — the other OG
  fault this repo has had, and why a green `npm run build` did not catch it.
