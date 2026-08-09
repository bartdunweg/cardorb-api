# binder

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

## Shape

```
lib/core/   the domain layer. No React, no routes. This is the part worth having.
lib/api/    who may write, and how often.
app/api/v1/ the four endpoints.
app/        the web tool. A placeholder today.
```

Two things in `lib/core` are deliberately hollow. `localise()` and `measure()` in
`util.ts` used to swap a remote image for a copy the portfolio served itself, and
those paths resolve on one domain only, so an iOS client would have been handed a
thousand broken pictures. Here the scans come from the catalogues directly. When
binder wants its own artwork in-house, `util.ts` is the one file that changes.

`TRADING_DATABASE` in `lib/core/notion.ts` is also written down in the
portfolio's own `lib/notion.ts`, which reads one row out of the same database for
the card on its about page. Two copies of an id is how two projects end up
pointed at two different databases six months apart, so if it ever moves, it
moves in both.
