---
id: ADR-0035
title: The public OG image is force-dynamic, not statically revalidated
status: accepted
date: 2026-08-16
scope: repo
deciders: [Bart]
superseded-by: null
tags: [og-image, caching, incident, next]
---

# The public OG image is force-dynamic, not statically revalidated

## Context and problem statement

Immediately after ADR-0034 deployed, every `/user/<name>` OG image answered 500
on production. Local `npm run dev` and a local production build (`npm run build
&& npm start`) both rendered it fine, so this was only ever going to be found on
Vercel or not at all. The Vercel runtime log had it exactly:

```
Error: Dynamic server usage: Route /user/[username]/opengraph-image/[__metadata_id__]
couldn't be rendered statically because it used `cookies`.
```

`app/user/[username]/opengraph-image.tsx` declared `runtime = "nodejs"` and
`revalidate = 3600`, and no `dynamic`. `revalidate` asks Next to render the route
statically and re-render it on a timer. That route cannot be rendered statically:
it calls `ownerOf()`, which reads a profile through `serverClient()`, which reads
`cookies()`, and a static render has no cookies to hand it.

**The configuration was wrong before ADR-0034, not because of it.** What ADR-0034
changed is that it deleted `generateStaticParams()` from the page segment, which
had been returning the single hardcoded `PUBLIC_USERNAME`. That one prerenderable
username was papering over the misconfiguration: the route was only ever
"working" for one name, which was the same defect ADR-0034 existed to remove.

Worth naming plainly, because it is the reusable lesson: `npm run check` and
`npm run build` were both green on the commit that shipped this, and the local
production build served the image at 200. Static-vs-dynamic rendering is decided
differently on Vercel than by `next start`, so neither local command could have
caught it. The thing that caught it was fetching the deployed URL after the
deploy, and the thing that diagnosed it in one step was `vercel logs`.

## Considered options

1. **Keep `revalidate` and make the profile lookup cookieless** — give
   `publicProfile()` an anonymous Supabase client, since `profiles_read` is
   `is_public or id = auth.uid()` and the query already filters
   `.eq("is_public", true)`, so an anonymous caller sees exactly the same rows.
   This would have kept static rendering and its caching. Rejected as a hotfix:
   `publicProfile()` is shared by the page and three routes, and redesigning the
   storage layer's client selection while production is 500ing is the wrong order
   of operations. Still the better long-term shape if the OG image's cost ever
   matters — recorded here so it is not re-derived from scratch.
2. **`force-dynamic`, plus a `Cache-Control` header on the `ImageResponse` so a
   CDN still holds it** — attempted, and measured: Next answers `no-store` for a
   force-dynamic route and overrides the header. The header was removed rather
   than left in place looking like it did something.
3. **`force-dynamic`, drawn per request** — chosen.

## Decision

`export const dynamic = "force-dynamic"` replaces `export const revalidate =
3600`, matching the page the image belongs to and adopting that page's own
argument: `/user/<name>` is force-dynamic so that turning sharing off takes
effect on the next request rather than on the next revalidate, and a preview
image that outlived that switch by an hour would be the same leak in a different
file.

No `Cache-Control` alongside it, per option 2's measurement. The comment in the
file says the picture is drawn per request and why that is affordable, rather
than claiming caching it does not get.

## Consequences

- Good, because the route renders correctly for every profile instead of for one
  hardcoded name — verified on production for two different accounts.
- Good, because a collection switched to private stops being previewable at once,
  consistent with its page.
- Bad, because the image is drawn per request. Bounded: the expensive half is the
  collection, and `getCards()`'s `unstable_cache` still holds that across
  requests; what remains is Satori drawing a header and five scans, on a route
  that only scrapers fetch and that is in no page's critical path.
- Neutral, because the build table still labels the route `●`. That is how Next
  marks a route with `generateImageMetadata`; the authority is
  `.next/prerender-manifest.json`, which no longer lists it.

## Confirmation

`npm run check` and `npm run build` green. The route is absent from
`.next/prerender-manifest.json`. On production after deploy: both
`/user/bartdunweg` and `/user/pikachu` OG images answer 200 and draw the right
name and card count.

## Related

- Follows: ADR-0034, which exposed this by deleting the `generateStaticParams`
  that hid it
- Code: `app/user/[username]/opengraph-image.tsx`
