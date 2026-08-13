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

## Shape

```
lib/core/       the domain layer. No React, no routes. This is the part worth having.
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

`TRADING_DATABASE` in `lib/core/notion.ts` is also written down in the
portfolio's own `lib/notion.ts`, which reads one row out of the same database for
the card on its about page. Two copies of an id is how two projects end up
pointed at two different databases six months apart, so if it ever moves, it
moves in both.
