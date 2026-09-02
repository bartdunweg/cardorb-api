# State

Where this project stands right now. Read it at the start of a session; update it at the end.
This file is deliberately short — it orients, it does not document. The rules that apply now
live in `CONVENTIONS.md`.

Rewrite it in place. This file has no history worth keeping; the history is in git.

Keep it under 100 lines, and keep at most one section about a previous release. `CLAUDE.md`
loads this file on every request, so its length is a cost paid continuously.

## Now

Card Orb is two repositories on two Vercel projects, and both apps take one road to the cards:

- **This repository, `bartdunweg/cardorb-api`** — the API only, at `api.cardorb.com`
  (Vercel project `cardorb-api`). `/v1/*` is the API, `/openapi.yaml` the contract, and `/`
  redirects to the reference the web app draws from it (cardorb.com/docs/api). Every caller
  is an account: a Supabase access token as bearer, or the session cookie on this origin.
- **`bartdunweg/cardorb-web`** — the web app at `cardorb.com` (Vercel project `cardorb`). It
  reads and writes cards, folders and profiles through this API with the session's access
  token; Supabase directly is auth only (its R-DATA-003). The iOS app does the same.

Shipped on 2026-09-02, in order: the web tool left this repository (#135); `GET /v1/cards`,
`/v1/stats`, `/v1/pokedex`, `/v1/folders` and `collectionId` on a copy (#136); the public
profile route (#137); a credential-aware rate limiter (#138) — the web app's servers share an
egress address and ten a minute would have taken the site down; public reads as the service
role, scoped to one public profile, with a failed read a 503 nothing caches (#139) — the
anonymous role may read only the public columns of `cards` since the web app's schema review;
`/` on the API host to the reference (#141); then the passcode retired, every failure through
`apiError()`, a paged `GET /v1/public/<username>/cards`, and a migration file recording the
`collections` table, `cards.collection_id` and the anonymous grants as the web app made them.

Then prices from Cardmarket's guide at build time (one file a day, cached as a small map)
instead of one TCGdex request per card: a cold build was minutes, which the first visitor after
a deploy paid; TCGdex is asked only for a card the guide does not know.

And a build that cannot reach the store or the catalogue is a 503 nothing caches, on every
route: one 404 from TCGdex's set index during a cold build had left every card without a
picture, a price or an id, cached for a day.

The schema lives here again: the five migrations the web app applied from its own checkout
(`20260823…`–`20260831…`) were fetched from the live history table, the migration recording
the folders and the anonymous grants is applied, and `cards.wishlist` and
`cards.pokedex_numbers` are dropped — nothing read them. Applying and recording goes through
`supabase db query --linked` and `supabase migration repair`, which need the CLI login and
not the database password.

`./scripts/verify.sh` exits 0 here.

## Next

1. **Move the web app's public page onto `GET /v1/public/<username>/cards`** so it stops
   fetching the whole public collection (~940 kB) to show a hundred cards.

## Open

- **`/v1/session` and the cookie helpers stay although no browser client lives here.**
  Removing them is a `/v2` question (R-API-008), not a cleanup.
- **`cards.collection_id` is `on delete set null` on the live database** (read on
  2026-09-02), so `deleteFolder()` emptying a folder first is belt and braces, not a
  necessity. The migration file declares the reference without it; harmless, already applied.
- **`lib/core/collection/value-chart.ts` has a damaged sentence** in its header (lines 12–13). Left alone.
- **Coverage is not measured since the split;** no floor is wired into `verify.sh`.
- **dev-standards rule-count contradiction persists at v0.27.0.** The `CONVENTIONS.md`
  template says there is no rule-count ceiling; `verify.sh.template` still fails above 15
  rules. `scripts/verify.sh` runs every clause of the `conventions` check except the count and
  says so. Upstream fix `bartdunweg/dev-standards#45` is open; put nothing back here when it
  merges.
