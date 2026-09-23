---
paths:
  - "src/app/api/**"
  - "src/lib/api/**"
  - "public/openapi.yaml"
---

# Route handlers and the contract

- **Everything under `/api/v1` requires a viewer** except the open set below. Anything wider
  hands out a keyed API for free, so a new route is authorised until someone argues otherwise
  here. The set, and it is checked by counting rather than remembered:

  ```
  find src/app/api/v1 -name route.ts | while read f; do
    grep -qE 'authorise\(|authoriseWrite|requestViewer|refuseCron' "$f" || echo "${f#src/app/api/v1}"
  done | sort
  ```

  - **Five under `/api/v1/public/`** — four per person (`<username>/profile`, `/cards`,
    `/cards/<tcgId>`, `/folders`), which carry no prices and answer 404 for a profile that is
    not public, and `/public/species`, which is the catalogue of Pokémon names and belongs to
    nobody. Each has its own rate limiter, because none of them passes through `authorise()`.
  - **The doors themselves** — `/session`, `/signup`, `/password`, `/password/reset`,
    `/confirmation`, `/email`. You cannot be signed in to sign in.
  - **`/usernames/<name>`**, whether a name is free. It is the one open route that uses the
    service-role key, which bypasses RLS: it must never grow a field beyond taken/free.
  - **Five under `/api/v1/catalog/`**: `/catalog/sets`, `/catalog/sets/<setId>`,
    `/catalog/search`, `/catalog/index` and `/catalog/cards`, which answer a caller who names
    nobody with the catalogue alone, because the catalogue minus the holdings is nobody's
    secret. They call `authoriseOpen()`, which refuses a credential that is offered and does
    not verify, and leaves every holding field out rather than zeroed for a caller who offers
    none. The last two are the command palette's pair, the document it searches in the browser
    and the prices and marks it asks for the hits it shows, and the palette has to work for a
    visitor with no account. `/catalog/index` has no holding field to leave out at all; on
    `/catalog/cards` the price stays where the marks go, because what a card trades at is a
    fact about the card.
  - **Two under `/api/v1/cards/<tcgId>`**: the card itself and `/prices`, its price line, since
    2026-09-23. The card sheet opens from Browse, and a visitor saw its price line read "could
    not be loaded". Neither answer carries anything of the reader's, and the price that was the
    reason to close them is a catalogue price the owner made public on 2026-09-22, history
    included: one card's price was already readable through `/catalog/sets/<setId>`. What stays
    shut is a person's collection, which is what a stranger could total up. They call
    `authoriseOpen()` like the catalogue routes, and `/prices` reads under the key `catalogue`
    for a caller who names nobody. That caller's price lines (here and on
    `/catalog/sets/<setId>?from=`) are read through the service role, passed as
    `getCardPrices(…, "nobody")`: `anon` has no grant on `card_price_months`, and is not to get
    one, because with the anon key every browser carries it would read the table straight
    through PostgREST, past the API's limiter.
  - **`/health`**.

  It said "the three routes under `/api/v1/public/<username>/`" and there were four of those
  even then, none of the doors, and no species route yet. The grep names `authorise(` and `authoriseWrite`
  rather than `authorise`, because `authoriseOpen` contains that shorter string too: with the
  looser pattern the three catalogue routes counted as guarded and opened unseen.
- **`/api/v1/collection` calls `authorise()`** and refuses an anonymous caller. It used to be
  open; it was closed when the public profile shipped, and its docstring says why. Do not "fix"
  the guard back off. `/api/v1/cards/:tcgId` was closed with it, for the price it carries, and
  opened again on 2026-09-23 once catalogue prices were public (see the open set above): its
  answer is the card's, where the collection's is a person's.
- **A public collection exposes exactly two variant fields, `rarity` and `owned`.** It is an
  allow-list, so a new column is excluded by default. An earlier version nulled the price and
  left `card.variants` untouched, publishing purchase price, date, condition and grade.
  Enforced by `src/lib/core/collection/cards-public.test.ts`.
- **A route that reads a JSON body bounds it with `readJsonBody()` and a named `BODY_LIMIT`.**
  Nothing else does: Next sets no limit and neither does `next.config.ts`. Enforced by
  `src/lib/api/body.test.ts`.
- **Request bodies are narrowed by hand, after `readJsonBody()`.** Zod is for the process
  boundary that runs once and must fail loudly, today only `lib/core/env.ts`. A schema for
  three fields costs more to read than the three `typeof` checks it replaces.
- **Every failure under `/api/v1` is `{ error: string }`** at a status the client branches on.
  `lib/api/respond.ts` writes it; a new key beside `error` goes in the contract first. Two
  clients show the sentence and branch on the status. Enforced by `src/app/api/openapi.test.ts`.
- **`public/openapi.yaml` describes every route under `src/app/api/v1` and nothing else.**
  Code and contract change in one commit. Enforced both directions by
  `src/app/api/openapi.test.ts`.
- **`api.cardorb.com` is a host-conditional rewrite of this deployment, never a second one.**
  The browser keeps calling `/api/v1` on its own origin; only bearer clients use the host. The
  session cookie is scoped to cardorb.com and would not cross to the API host. Enforced by
  `src/lib/api/api-host.test.ts`.
- **`/v1/session` and the cookie helpers stay** although no browser client lives here.
  Removing them is a `/v2` question, not a cleanup.
