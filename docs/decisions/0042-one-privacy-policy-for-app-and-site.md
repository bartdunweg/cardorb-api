---
id: ADR-0042
title: One privacy policy at /privacy, covering the website and the iOS app
status: accepted
date: 2026-08-16
scope: repo
deciders: [Bart]
superseded-by: null
tags: [legal, privacy, gdpr, ios, app-store, seo, routes]
---

# One privacy policy at /privacy, covering the website and the iOS app

## Context and problem statement

The iOS app cannot be submitted without a privacy policy, and App Store Connect
asks for a **URL** rather than a document — so the policy had to become a route
in this app before anything could be submitted at all. Nothing existed:
`/privacy`, `/terms` and `/legal` were all absent, and this is the third public,
indexable page here after `/` and `/user/<name>`.

A draft already existed in the iOS workspace
(`cardorb-ios/memphis/docs/privacy-policy-draft.md`), written from
`PrivacyInfo.xcprivacy`, the backend schema and that app's Sentry configuration.

Two questions had to be answered before it could be published. Bart asked the
second one directly: *"de iOS-app heeft geen analytics, dus dat is toch de
waarheid? Of moeten we een aparte privacy policy voor de iOS-app maken? Wat is
gebruikelijk daar?"*

## Decision

**One policy, at `/privacy`, covering both surfaces.** Where the website and the
app genuinely differ, the difference is named in the sentence rather than split
into a second document.

Both of Bart's statements were true, of different things: the iOS app has no
analytics, and the **website** does (`<Analytics />` in `app/layout.tsx`). The
App Store privacy labels describe only the app, so "no analytics" stays the
correct answer there while the policy still discloses what the website does.

Rejected: **a policy per surface.** Apple only wants a URL and does not care that
the same document also covers a website. Two documents describing one account
system, one database and one set of processors is two things to keep in step, and
the first thing that drifts is the third-party list — which is exactly the part a
data subject relies on.

## The draft was wrong about this repo, in four places

The draft was written from the iOS side. Checked against this repo before
publishing:

| Draft said | This repo actually does | Source |
|---|---|---|
| "no analytics" | The **website** runs Vercel Web Analytics | `app/layout.tsx`, and `next.config.ts`'s CSP note about `va.vercel-scripts.com` |
| crash reports go to Sentry | True of iOS. The **website has no Sentry** — `onRequestError` logs to Vercel's function logs, and its comment says adding a service would be a decision about somebody else's servers holding this app's failures | `instrumentation.ts` |
| silent on cookies | One session cookie (`sb-…-auth-token`), plus `theme` in `localStorage`, which never leaves the browser | `lib/api/session-cookie.ts`, `app/layout.tsx` |
| "deleting removes everything" | True, and now stated with confidence: `auth.admin.deleteUser` plus `on delete cascade` takes cards, imports and profile in one transaction | `app/api/v1/account/route.ts` |

Two claims were checked and kept because they turned out to be structurally true
rather than merely intended, and both are worth stating plainly to a reader:

- **A public collection never carries a price.** The public card route strips
  `price` and `market`, and a test asserts it
  (`app/api/v1/public/[username]/cards/[tcgId]/route.test.ts`).
- **The catalogues never see a visitor.** pokemontcg.io, TCGdex and Cardmarket
  are only ever asked by this app's own servers; the CSP's `connect-src 'self'`
  makes that structural rather than a promise.

The Supabase region was the one fact nobody had written down. It is **eu-west-1**
(AWS Ireland) — read from `supabase projects list` rather than assumed, because
"probably the EU, he is Dutch" is not a basis for a sentence in a privacy policy.

## Consequences

- `/privacy` must set `robots: { index: true, follow: true }` explicitly. The
  root layout defaults the whole site to `noindex` on purpose, and a page App
  Store Connect links to is the opposite of a tool behind a password. It is in
  `sitemap.ts` for the same reason.
- The landing page's inline footer became `app/components/Footer.tsx`, because
  a legal page nothing links to is not published in any useful sense, and a
  copied footer is two footers by the next change.
- `app/routes.test.ts` now covers this for free: it asserts every `href="/…"`
  literal under `app/` resolves to a real route, so the footer and signup links
  cannot outlive the page.
- **The controller is a company, not a person**: BADU Ventures B.V., KVK
  76480801, Voorhaven 27C, Rotterdam. The first screenshot supplied showed that
  same number and address under the name *Strakzat B.V.*; queried, Bart
  confirmed twice that both belong to BADU Ventures. Recorded so the
  discrepancy is not rediscovered later and read as a mistake. The BTW number,
  the phone numbers and every personal field in that screenshot were
  deliberately left off — a privacy policy is not an invoice, and a published
  phone number invites spam where the stated channel is email.
- **This is not legal advice**, and the record should not be read as claiming
  otherwise. The policy is accurate about what the software does, which is the
  part that can be verified from here. The legal basis and the controller block
  are as supplied, and a policy covering EU users is worth a professional's ten
  minutes before it is relied on.

## Still open

- No `/terms`. Apple's standard EULA applies unless a custom one is supplied,
  and none was asked for.
- The iOS app should link to this URL from its own Settings — a change in
  `cardorb-ios`, not here.
- App Store Connect's privacy labels need **crash and diagnostic data** adding
  for the app, on account of Sentry. The "no analytics" answer there stays
  correct.
