---
id: ADR-0042
title: The iPhone app gets its own page, with a download button that does nothing yet
status: accepted
date: 2026-08-16
scope: repo
deciders: [Bart]
superseded-by: null
tags: [ios, marketing, seo, accessibility, routing]
---

# The iPhone app gets its own page, with a download button that does nothing yet

## Context and problem statement

The iOS client is real and in progress in its own repo, built against this app's
`/api/v1` surface — decisions 0008 and 0037 both exist because of it. On
cardorb.com it amounted to two throwaway sentences on the landing page: an inert
pill reading "iOS & Android — coming soon" and one feature card about scanning.

So the site could not answer the first question anybody asks about an app —
what does it do, and where do I get it — and there was no address to put a
download link on when there is one to put there.

Bart asked for "een specifieke pagina voor de iOS-app … waar we vertellen over
de app en waar we uitleggen wat de app is, wat die doet, en hoe je hem kan
downloaden met een downloadknopje of zo."

The awkward part is the last clause. The app is **not on the App Store**, has no
TestFlight build to hand out, and has no release date. A download button is
being asked for on a page for something nobody can download.

## Decision

A new page at **`/app/ios`**, in the landing page's visual language, ending on a
**download button that is present, focusable, and deliberately non-actionable**.

### Why the button ships inert rather than as a waitlist or a TestFlight link

Four options were on the table:

| | why not |
|---|---|
| No button at all | Answers the question with silence. The page then has to explain in prose what a greyed-out button says in one glance, and the day the app ships somebody has to design the CTA under time pressure. |
| A live App Store URL | There is no URL. A guessed one 404s, and a 404 from a "Download" button is the worst version of this page. |
| A TestFlight link | There is no build to hand out. Confirmed with Bart. |
| An email waitlist | A form means collecting addresses, storing them, and sending to them — a mailing list is a commitment and a GDPR surface, for a launch with no date. Explicitly rejected by Bart in favour of the inert button. |

So the button reads "Download on the App Store", carries `aria-disabled="true"`,
and points at a visible note through `aria-describedby`: *"Not on the App Store
yet. This is where the download will be."* Shipping day is then a one-line
change — `<Button href={APP_STORE_URL} external>` — and the note is deleted.

`aria-disabled`, **not** `disabled`. `disabled` takes the control out of the tab
order, and a control nobody can reach is a control that never gets to explain
itself. `components/Button.tsx` already documents exactly this case and
`components.css` already styles `.btn[aria-disabled="true"]`; this is that
convention being used, not a new one. It is a plain `<button>` rather than
`<Button>` because `Button` only renders a real button element when handed an
`onClick`, and there is nothing to hand it — a bare `<span className="btn">` is
not focusable, which would defeat the whole point.

It is also **not** an official Apple App Store badge. Those have marketing
guidelines attached and are for apps that are on the store; an official-looking
badge for an app that is not there reads as a claim rather than a plan.

### Why `/app/ios`, and why `/app` is a *temporary* redirect

`/ios` and `/download` were the alternatives. `/app/ios` was chosen because
Android is planned, and it is the only one of the three with room for a second
platform underneath it without either renaming the first page or ending up with
`/ios` and `/android` as unrelated siblings.

`/app` itself has no page. It redirects to `/app/ios` with **`permanent: false`**,
and the temporariness is the entire point of the entry: when the Android page
lands, `/app` should become the index of both, and a 308 cached in the browser of
everyone who ever followed it would make that change arrive weeks late for
exactly the people most interested in it.

A literal `app` segment does not collide with the `(app)` route group — route
groups contribute nothing to the URL, and `app/(app)/` has no `app` child.

### Why the JSON-LD has no `offers`, no `downloadUrl` and no `aggregateRating`

The page carries `SoftwareApplication` markup with `operatingSystem: "iOS"`.
Those three properties are the ones a search engine reads as *this is available,
at this price, and people rate it*, and none of that is true yet. Structured data
is the one place a hedge in the copy does not reach, so the hedge has to be the
absence of the property rather than a careful wording of it.

### What the copy is allowed to claim

Every feature line maps to something this repo's API already answers for: the
collection and wishlist (`/api/v1/collection`), per-variant inventory (ADR-0008),
the catalogue you do not own yet (`/api/v1/catalog/sets`, ADR-0037), Cardmarket
value in euros, value over time (`/api/v1/value-history`). Camera scanning is
marked "coming soon", the same way the landing page already marks it. A feature
list for an app nobody can download is very easy to write and very hard to walk
back.

Screenshots are **visible dashed placeholders**, not stock phone mock-ups. A
mock-up of a screen the app does not have yet is a picture of a promise; a slot
that obviously has nothing in it is honest and takes five minutes to fill.

## Consequences

- Two extractions out of `app/page.tsx`, both pure moves:
  `components/marketingClasses.ts` (the six class recipes, which carried a
  comment saying they stayed strings "since every consumer is on this one page"
  — this change is what ended that condition) and `components/MarketingFooter.tsx`
  (the inline footer, so both public pages carry the same one).
- `/app/ios` is the site's third indexable route, after `/` and `/user/<name>`.
  It opts back in explicitly, because the root layout defaults everything to
  `noindex`, and it is listed in `sitemap.ts` by hand because it is static.
- The landing hero's badge is a link now instead of an inert `<span>`, and
  "iPhone app" is in both the landing navbar and the shared footer.
- When the app ships: swap the button for `<Button href external>`, delete the
  note, drop the real screenshots into `public/app/ios/`, add `offers` to the
  JSON-LD, and raise the sitemap priority.

## Verification not performed

The rendered page was checked over HTTP (status, metadata, heading order,
sitemap, the `/app` redirect) but **not looked at in a browser** — the Chrome
extension was not connected in this session. Layout and the responsive
collapses at 640/800px are reasoned from the landing page's own patterns, not
observed.
