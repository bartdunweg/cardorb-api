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
    grep -qE 'authorise|requestViewer|CRON_SECRET' "$f" || echo "${f#src/app/api/v1}"
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
  - **`/health`**.

  It said "the three routes under `/api/v1/public/<username>/`" and there were four of those
  even then, none of the doors, and no species route yet.
- **`/api/v1/collection` and `/api/v1/cards/:tcgId` call `authorise()`** and refuse an
  anonymous caller. They used to be open; they were closed when the public profile shipped,
  and each route's docstring says why. Do not "fix" the guard back off.
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
