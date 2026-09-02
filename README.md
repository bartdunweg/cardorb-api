# Card Orb

A Pokémon card collection: 1,600-odd cards kept in Postgres (Supabase), matched
against three card catalogues, priced, and served as an API that a web tool and
an iOS app both read.

It began as `/cards` on [bartdunweg.com](https://bartdunweg.com), which is why
the first commit is not a scaffold. Two years of work sit in `lib/core`: matching
a hand-kept database against TCGdex, Limitless and pokemontcg.io, resolving
artwork set by set rather than card by card, and turning Cardmarket's feed into a
number a collector would recognise. None of that was worth writing twice.

## The API

**The contract is [`public/openapi.yaml`](public/openapi.yaml)**, served as-is at
`/openapi.yaml` and rendered as plain HTML at [`/docs/api`](https://cardorb.com/docs/api).
A test holds it against the route files in both directions, so a route that is not in it
does not ship. On `api.cardorb.com` the same API is `/v1/…` and the reference is `/`; the
browser keeps calling `/api/v1` on its own origin, because its session cookie does not
cross hosts. Every failure is `{ "error": "<sentence>" }` at a status a client can branch
on. `docs/api-design.md` has the reasoning.

Every **data** route under `/api/v1/` needs a viewer, reading included. The key is
`CARDS_TOKEN`, one shared passcode rather than an account system: one person edits
this. The exceptions are not data: the bootstrap and health routes
(`/health`, `/session`, `/signup`, `/password/reset`, `/confirmation`, `/username`)
and the `/cron/snapshot` job carry no viewer, and are gated by `sameOrigin()` or
`CRON_SECRET` instead — each route's own docstring says which and why.

| | |
| --- | --- |
| `GET /api/v1/collection` | the whole thing, grouped by set — viewer required |
| `GET /api/v1/cards/:tcgId` | one card, its printings and its price — viewer required |
| `GET /api/v1/fields` | the database's select options — viewer required |
| `POST /api/v1/cards` | add a card — viewer required |

**These two used to be open and this section used to say so.** They were closed
when `/user/<name>` shipped, and each route's own docstring says why. The
genuinely unkeyed routes are the three under `/api/v1/public/<username>/`, which
serve the public profile: they never call `authorise()`, they carry no prices, and
each has its own rate limiter (R-API-001, R-API-002).

| | |
| --- | --- |
| `GET /api/v1/public/:username/collection` | the public collection, two variant fields only |
| `GET /api/v1/public/:username/cards/:tcgId` | one card, no price |
| `GET /api/v1/public/:username/latest-pull` | the most recent addition |

Browsing the catalogue — every set and every card in it, not only what is owned —
is a separate, signed-in surface. It reads pokemontcg.io rather than the
database, and each answer carries the caller's own `owned` / `wishlist` /
`quantity` for the cards in it.

| | |
| --- | --- |
| `GET /api/v1/catalog/sets` | every set, with how much of each you hold |
| `GET /api/v1/catalog/sets/:setId` | one whole set, `page` / `pageSize` |
| `GET /api/v1/catalog/search` | find a card by name, number, set or type |

Each card carries `image` and `imageHigh`. Use `image` in a grid and fetch
`imageHigh` only where a card is drawn large — they are 26 kB and 87 kB where
TCGdex has the card, and 198 kB and 674 kB on the pokemontcg.io fallback. A set
page is a few hundred of them, so the difference is megabytes, not kilobytes.

Native clients authenticate with a Supabase access token in `Authorization: Bearer <jwt>`.
Alongside the collection routes they use `GET/PATCH /api/v1/profile`,
`PATCH/DELETE /api/v1/collection/items/:id`, `GET /api/v1/catalog/*`,
`GET /api/v1/value-history` and `DELETE /api/v1/account` — checked against
`bartdunweg/cardorb-ios`, not assumed.

**Native clients do not call `/api/v1/public/:username/collection`.** This line
used to say they did, which is worth correcting rather than deleting: that one
wrong sentence is the only reason that change shipped with "we may have broken the
iOS app" beside it. The public routes are for a browser and for the portfolio
site; the app is signed in and reads `/api/v1/collection`, which carries the
inventory fields as it always has.

The public collection response carries no prices and no inventory: of each
printing it publishes the rarity and whether it is owned, and nothing else — not
what was paid, the condition, the grade, the notes, or how many.

`GET /api/v1/value-history` answers with **the caller's own** series, oldest
reading first. It needs a bearer token: the deprecated `x-cards-key`
header is a passcode rather than an identity, so it carries no session for row
level security to judge and that path answers with an empty series.

### The latest pull, for another site

```
GET https://cardorb.com/api/v1/public/bartdunweg/latest-pull
```

The one route meant to be read from a different domain, so it is the one route that
sends `Access-Control-Allow-Origin: *`. **No key**: a key shipped in a public site's
JavaScript is not a secret, only an extra thing to keep in sync, and this route carries
no auth, no cookies and no prices. Rate-limited at 60/minute per address and cached for
five minutes at the CDN, so a widget should fetch it and not think about it.

```js
const res = await fetch("https://cardorb.com/api/v1/public/bartdunweg/latest-pull");
if (res.ok) {
  const { latestPull } = await res.json();
  // name, number, image, imageHigh, rarity, speciesId, tcgId, setName, setTitle, acquiredAt
}
```

Three things to know before you render it:

- **`image` can be relative.** A scan that comes from Limitless is served through this
  app's CORS proxy as `/api/cover?url=…`, so prefix anything starting with `/` with
  `https://cardorb.com`. It can also be `null`.
- **`imageHigh` is only set for TCGdex scans**, `null` for everything else. Never rely
  on it alone. `rarity`, `speciesId` and `tcgId` are nullable too.
- **404 means nothing to show** — `{"error":"No card found."}` for an empty or entirely
  excluded collection, `{"error":"No such collection."}` for an unknown username. There
  is no `latestPull` key on either, so branch on `res.ok`.

The card is the newest printing that is owned, dated, and not marked `excluded` in the
card dialog — that checkbox is how you keep one out of this. Wishlist rows never appear
(deliberately unkeyed — a key in a public site's JavaScript is not a secret).

`GET /v1/fields` is behind the key on purpose: it is the cheapest thing a client
can call to find out whether the key it holds still works, so signing in is one
request rather than a failed card.

`PATCH` and `DELETE` come when the tool needs editing.

## Running it

```
npm install
cp .env.example .env.local   # then fill in the Supabase vars and CARDS_TOKEN
npm run dev
curl localhost:3000/api/v1/collection | jq '.sets | length'
```

`npm run check` is typecheck, tests and lint together.

## Production

Deployed on Vercel, DNS on Cloudflare (DNS-only, not proxied — Cloudflare in front of
Vercel would break `x-forwarded-host`, which `sameOrigin()` in `lib/api/guard.ts` reads).
Env vars, matching what `lib/core/env.ts` checks at boot and `.env.example` documents:

| | required | |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | the collection's database; public by design, RLS is what stops a stranger, not secrecy |
| `CARDS_TOKEN` | yes | the one passcode that may write |
| `OWNER_EMAIL` | yes | the address the login checks against |
| `SUPABASE_SERVICE_ROLE_KEY` | account-deletion path only | bypasses every policy, so it never reaches the browser |
| `NEXT_PUBLIC_SITE_URL` | recommended | `https://cardorb.com` in production — canonicals, `og:url`, the sitemap and `robots.txt` all read this |
| `ALLOWED_ORIGINS` | no | *other* sites allowed to post here; this app's own domain never needs to be in it |
| `CATALOGUE_SET_PRICING_MAX` | no | `0` until there is a second account; see below |

`NEXT_PUBLIC_SITE_URL` matters more than its "recommended" tag suggests: without it,
`SITE_URL` falls back to Vercel's `VERCEL_PROJECT_PRODUCTION_URL`, which is whichever
`*.vercel.app` alias Vercel currently treats as production rather than the custom domain —
set it explicitly the moment a custom domain is attached, or a canonical link can point at
the wrong address.

## The database

The collection lives in Postgres (Supabase); it started in Notion and was
migrated over. The schema is in
`supabase/migrations/`.

Four things have to be set up once, and each of them fails in a way that looks
like something else if it is left until the day it is needed.

**Custom SMTP, before open signup.** Supabase's built-in mail is a handful of
messages an hour and, on a new project, only to team addresses. Sign-up
confirmation and password reset both go through it, and the failure the user sees
is "check your email" followed by nothing. Resend's free tier is enough; the
sending domain is `cardorb.com` and its DNS is already at Cloudflare. Set SPF,
DKIM and DMARC while you are there — confirmation mail in a spam folder is
exactly as broken as no confirmation mail.

**A keepalive.** Free Supabase projects pause after about a week of quiet and the
public page 500s. `vercel.json` runs a daily cron against `GET /api/v1/health`,
which queries one row — enough to count as activity — and doubles as the monitor:
it answers 503 when the database is configured and not answering, so a check that
only reads the status code still means something. Development runs against a local
`supabase start` rather than a second cloud project, because a second cloud
project is precisely the one that would sit quiet long enough to pause.

**Asymmetric JWT signing keys, before the guard reads a token.** With them, a
token is verified locally against the project's JWKS; without them, every
authorised request costs a round trip to Supabase. That is the difference between
microseconds and tens of milliseconds on every API call, and it is a setting
(Project Settings → JWT Keys), not a rewrite.

**`scripts/rls-check.mjs`, before each of the phases that widens access.** Row
level security is the wall here and it cannot be unit tested — CI has no secrets
and should keep having none. So it is a script: two users on a scratch project,
each trying to read, update and delete the other's rows, asserting that every
attempt comes back empty. Run it by hand and read the output.

`CATALOGUE_SET_PRICING_MAX` is a bet worth leaving unmade for now. The catalogue
is cached per set and shared by everyone who owns a card from it, so pricing a
whole set once is cheaper than pricing each owner's holdings separately — but
only once a set has more than one owner. At `0` it prices only what is held,
which is what this always did. Set it to `400` when there is a second account,
and measure rather than assume.

## Shape

Everything lives under `src/`. Where a new file goes is decided by who uses it,
not by what it is:

```
src/app/<route>/              routing and data fetching only
src/app/<route>/_components/  UI that only that route uses
src/features/<domain>/        UI and hooks owned by one domain — collection, account
src/components/shared/        UI with no domain: Button, Modal, FormField, Card
src/components/base/          vendored Untitled UI primitives — CLI-managed
src/components/application/   vendored Untitled UI patterns
src/components/foundations/   vendored icons and logos
src/lib/core/                 the domain layer. No React, no routes. The part worth having.
src/lib/core/catalogue/       what a card is: the three catalogues, matching, artwork, prices
src/lib/core/collection/      what you own: rows, assembly, statistics, value over time
src/lib/core/account/         who you are: username and password rules, what to call you
src/lib/storage/              where the collection is kept, and the only part that knows.
src/lib/api/                  who may read and write, and how often.
src/styles/theme.css          every design value, and the only place one may be written
src/styles/globals.css        imports, base, variants. Hard ceiling: 200 lines.
src/styles/app.css            the exception layer. Starts empty; keep it that way.
src/styles/poke-holo.css      the holographic shine — vendored, and one of the two
                              things that are the product's identity
src/hooks/ utils/ providers/  small, shared, and partly vendored
scripts/                      the generators src/lib/core keeps referring to
supabase/                     auth and session backing store, migrations
```

Three folders the target layout names do not exist here, and that is deliberate:
`types/` (types live beside what defines them) and `features/*/actions.ts`,
`queries.ts`, `schemas.ts` (data access is in `lib/`). Create them when there is
something to put in them, not before.

**The rules that hold this together — including which folder a thing belongs in
and what may import what — are in [`CONVENTIONS.md`](./CONVENTIONS.md).** Three
of them are enforced by `npm run lint`; the rest are review.

Two route notes worth knowing before reading the tree: `src/app/@modal/` is a
card shown as a dialog, intercepted so the list behind it survives, and
`src/app/api/cover/` is a same-origin passthrough for the one image host that
sends no CORS headers.

The web tool is the portfolio's `/cards`, moved rather than rewritten: the same
rail, the same dashboard, the same Pokédex, the same tilt on a holo. Four things
changed on the way over. The endpoints are Card Orb's (`/api/v1/fields` and
`/api/v1/cards` instead of one `/api/cards`), the imports point at `lib/core`,
the locale stays `nl-NL`, so the numbers read `€ 41.042` rather than `€41,042`,
and the JSON-LD came out of `/cards` because that screen ships `noindex`. Two
pages do not: `/`, which is the landing page, and `/user/<name>`, which is the
collection you hand to someone. Both carry a graph again, and they are the only
two entries in `sitemap.xml`.

The signed-in screens read the collection through `src/lib/core` directly rather
than through their own `/api/v1/collection`: a server component has no relative
fetch, and the port changes per workspace. The route handler wraps the same
function, so there is one implementation and nothing to drift.

`/` is the landing page, `/login` is the door, and the collection lives at
`/collection` inside the `(app)` group. **`/cards` is a redirect** — it was the
whole app for two years and is in bookmarks, in the iOS client's memory and in
shared links, so it keeps answering by pointing at the real address. The proxy
bounces a signed-out request to `/login` with a `next` parameter, so the form
can put you back where you were aiming.

Two things in `lib/core` are deliberately hollow. `localise()` and `measure()` in
`util.ts` used to swap a remote image for a copy the portfolio served itself, and
those paths resolve on one domain only, so an iOS client would have been handed a
thousand broken pictures. Here the scans come from the catalogues directly. When
Card Orb wants its own artwork in-house, `util.ts` is the one file that changes.
