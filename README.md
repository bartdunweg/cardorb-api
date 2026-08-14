# Card Orb

A Pokémon card collection: 1,600-odd cards kept in Notion, matched against three
card catalogues, priced, and served as an API that a web tool and an iOS app both
read.

It began as `/cards` on [bartdunweg.com](https://bartdunweg.com), which is why
the first commit is not a scaffold. Two years of work sit in `lib/core`: matching
a hand-kept database against TCGdex, Limitless and pokemontcg.io, resolving
artwork set by set rather than card by card, and turning Cardmarket's feed into a
number a collector would recognise. None of that was worth writing twice.

## The API

Reading is open, because this collection is already public. Only writing carries
a key, which is `CARDS_TOKEN` and is one shared passcode rather than an account
system: one person edits this.

| | |
| --- | --- |
| `GET /api/v1/collection` | the whole thing, grouped by set |
| `GET /api/v1/cards/:tcgId` | one card, its printings and its price |
| `GET /api/v1/fields` | the database's select options, key required |
| `POST /api/v1/cards` | add a card, key required |

`GET /v1/fields` is behind the key on purpose: it is the cheapest thing a client
can call to find out whether the key it holds still works, so signing in is one
request rather than a failed card.

`PATCH` and `DELETE` come when the tool needs editing.

## Running it

```
npm install
cp .env.example .env.local   # then fill in NOTION_TOKEN and CARDS_TOKEN
npm run dev
curl localhost:3000/api/v1/collection | jq '.sets | length'
```

`npm run check` is typecheck, tests and lint together.

## Production

Deployed on Vercel, DNS on Cloudflare (DNS-only, not proxied — Cloudflare in front of
Vercel would break `x-forwarded-host`, which `sameOrigin()` in `lib/api/guard.ts` reads).
Seven env vars, matching what `lib/core/env.ts` checks at boot and `.env.example`
documents:

| | required | |
| --- | --- | --- |
| `NOTION_TOKEN` | yes | reads and writes the card database |
| `CARDS_TOKEN` | yes | the one passcode that may write |
| `OWNER_EMAIL` | yes | the address the login checks against |
| `NEXT_PUBLIC_SITE_URL` | recommended | `https://cardorb.com` in production — canonicals, `og:url`, the sitemap and `robots.txt` all read this |
| `ALLOWED_ORIGINS` | no | *other* sites allowed to post here; this app's own domain never needs to be in it |
| `PUBLIC_USERNAME`, `OWNER_NAME` | no | whose collection `/user/<name>` shows |

`NEXT_PUBLIC_SITE_URL` matters more than its "recommended" tag suggests: without it,
`SITE_URL` falls back to Vercel's `VERCEL_PROJECT_PRODUCTION_URL`, which is whichever
`*.vercel.app` alias Vercel currently treats as production rather than the custom domain —
set it explicitly the moment a custom domain is attached, or a canonical link can point at
the wrong address.

## Accounts, and the database under them

This is being taken from one passcode to real accounts. The migration is in
`supabase/migrations/`, and it is deliberately something you turn on rather than
something you have to finish: the tables are additive, `COLLECTION_SOURCE`
defaults to `notion`, and until it says `postgres` nothing below is load-bearing.
Flipping it back is the whole rollback plan.

| | required | |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | once migrated | public by design; RLS is what stops a stranger, not secrecy |
| `SUPABASE_SERVICE_ROLE_KEY` | scripts only | bypasses every policy, so it never reaches the browser |
| `SECRETS_KEY` | for Notion connections | 32 bytes of hex; AES-256-GCM over somebody else's Notion token |
| `COLLECTION_SOURCE` | no | `notion` (default) or `postgres` — the cutover switch |
| `CATALOGUE_SET_PRICING_MAX` | no | `0` until there is a second account; see below |

Four things have to be set up once, and each of them fails in a way that looks
like something else if it is left until the day it is needed.

**Custom SMTP, before open signup.** Supabase's built-in mail is a handful of
messages an hour and, on a new project, only to team addresses. Sign-up
confirmation and password reset both go through it, and the failure the user sees
is "check your email" followed by nothing. Resend's free tier is enough; the
sending domain is `cardorb.com` and its DNS is already at Cloudflare. Set SPF,
DKIM and DMARC while you are there — confirmation mail in a spam folder is
exactly as broken as no confirmation mail.

**A keepalive, before the link is shared.** Free Supabase projects pause after
about a week of quiet and the public page 500s. `GET /api/v1/health` exists to be
hit by a daily Vercel cron, which keeps the project awake and doubles as the
monitor. Development runs against a local `supabase start` rather than a second
cloud project, because a second cloud project is precisely the one that would sit
quiet long enough to pause.

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

```
lib/core/       the domain layer. No React, no routes. This is the part worth having.
lib/storage/    where the collection is kept, and the only part that knows.
lib/api/        who may write, and how often.
app/api/v1/     the four endpoints.
app/api/cover/  a same-origin passthrough for the one host that sends no CORS headers.
app/page.tsx    the landing page: the one screen written for someone new here.
app/login/      the password field, and the redirect back to where you were aiming.
app/cards/      the collection: the rail, the dashboard, the Pokédex, one card.
app/@modal/     that card again, as a dialog, intercepted so the list survives.
app/components/ everything the two above are built from.
app/styles/     the portfolio's stylesheets, copied whole rather than trimmed.
scripts/        the generators lib/core keeps referring to.
```

The web tool is the portfolio's `/cards`, moved rather than rewritten: the same
rail, the same dashboard, the same Pokédex, the same tilt on a holo. Four things
changed on the way over. The endpoints are Card Orb's (`/api/v1/fields` and
`/api/v1/cards` instead of one `/api/cards`), the imports point at `lib/core`,
the locale stays `nl-NL`, so the numbers read `€ 41.042` rather than `€41,042`,
and the JSON-LD came out of `/cards` because that screen ships `noindex`. Two
pages do not: `/`, which is the landing page, and `/user/<name>`, which is the
collection you hand to someone. Both carry a graph again, and they are the only
two entries in `sitemap.xml`.

`app/cards/page.tsx` calls `getCards()` directly rather than its own
`/api/v1/collection`: a server component has no relative fetch, and the port
changes per workspace. The route handler wraps the same function, so there is
one implementation and nothing to drift.

`/` is the landing page and `/login` is the password field; the collection stays
at `/cards`. The list could have lived at the root, but the card dialog is an
intercepted parallel route and interception is defined relative to the segment
it intercepts, which is a poor thing to rewrite for one character of URL. The
proxy bounces a signed-out request for `/cards` to `/login` with a `next`
parameter, so the form can put you back where you were aiming.

Two things in `lib/core` are deliberately hollow. `localise()` and `measure()` in
`util.ts` used to swap a remote image for a copy the portfolio served itself, and
those paths resolve on one domain only, so an iOS client would have been handed a
thousand broken pictures. Here the scans come from the catalogues directly. When
Card Orb wants its own artwork in-house, `util.ts` is the one file that changes.

`TRADING_DATABASE` in `lib/storage/notion.ts` is also written down in the
portfolio's own `lib/notion.ts`, which reads one row out of the same database for
the card on its about page. Two copies of an id is how two projects end up
pointed at two different databases six months apart, so if it ever moves, it
moves in both.
