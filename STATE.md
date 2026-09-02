# State

Where this project stands right now. Read it at the start of a session; update it at the end.
This file is deliberately short — it orients, it does not document. The rules that apply now
live in `CONVENTIONS.md`.

Rewrite it in place. This file has no history worth keeping; the history is in git.

Keep it under 100 lines, and keep at most one section about a previous release. `CLAUDE.md`
loads this file on every request, so its length is a cost paid continuously.

## Now

Card Orb is live, and since 2026-09-02 it is two repositories on two Vercel projects:

- **This repository, `bartdunweg/cardorb-api`** — the API only, at `api.cardorb.com`
  (Vercel project `cardorb-api`). `/v1/*` is the API and `/` is the contract,
  `public/openapi.yaml`, served as-is. `/v1/health` answers `{"ok":true,"database":"reachable"}`.
- **`bartdunweg/cardorb-web`** — the web app, at `cardorb.com` (Vercel project `cardorb`;
  pnpm, Next 16, its own standards). It calls this API with a bearer token, as the iOS app does.

**The owner decided on 2026-09-02: the web app moves onto this API.** Both apps read the same
`cards` table, but the web app read it directly and fetched card data from pokemontcg.io itself,
so prices and pictures differed from iOS and every feature existed on one side only. From now
on only this API touches the cards; the web app calls `api.cardorb.com` with its Supabase
session as bearer, like iOS.

Step 1 shipped here: `GET /v1/cards` (flat, paged, filtered — read from the cached assembly so
a page is a filter over memory), `GET /v1/stats`, `GET /v1/pokedex` (slots only, no cards),
`/v1/folders` (the web app's `collections` table, which it made outside this repository's
migrations; "collection" already means the whole here, so they are folders in the contract),
and `collectionId` on a copy and its patch. `lib/core/collection/items.ts` holds the decisions
with tests. 477 tests.

## Next

1. **Move the web app onto the API** (`bartdunweg/cardorb-web`): an API client in `src/lib/api.ts`
   (bearer = the Supabase session's access token, base URL from env), then `lib/cards.ts`,
   `collections.ts`, `profile.ts`, `public-profile.ts`, `pokedex.ts` and the server actions call
   the API; adding a card goes through `/v1/catalog/search` and `POST /v1/cards`; `pokemontcg.ts`
   goes. Then a rule there: no `.from(` outside auth.
2. **Build the reference in `cardorb-web`** at `/docs/api` from `https://api.cardorb.com/openapi.yaml`,
   then point `api.cardorb.com/` at it (the one rewrite in `next.config.ts`). The old renderer
   is in git at `40cc85d`, `src/app/docs/api/`.
3. **Retire the passcode.** The iOS app already calls `api.cardorb.com/v1` (its PR #52). Watch
   the logs for `[deprecated] CARDS_TOKEN was used`, then drop the `passcode` scheme.
4. **Decide the two stale branches** (see `## Open`).

## Open`).

## Open` sections pasted over each
other.

## Next

1. **Take the web tool out of this repository.** The owner decided on 2026-09-02: this
   repository is the API only. One PR: `src/app/(app)`, the auth pages, `src/features/`,
   `src/components/` and their tests go; the API, the reference and `lib/` stay. Every UI
   item under `## Open` below closes with it.
2. **Redeploy so the canonicals follow the host.** `NEXT_PUBLIC_SITE_URL` on the `cardorb-api`
   project was changed to `https://api.cardorb.com` this session; it is inlined at build time
   (R-PLAT-002), so it takes effect on the next production deploy.
3. **Refresh `NPM_TOKEN` in the repository's Actions secrets** so CI is green again.
4. **Move the iOS app's base URL** to `api.cardorb.com` (`bartdunweg/cardorb-ios`), watch the
   logs for `[deprecated] CARDS_TOKEN was used`, then retire the passcode (design steps 3–4).
5. **Decide the two stale branches** (see `## Open`).

## Open

- **The Site URL in the Supabase dashboard must be `https://cardorb.com`.** Every auth email
  links to `{{ .SiteURL }}/auth/confirm`, which lives in `cardorb-web` since its PR #15. The
  `next=` values in `supabase/templates/*.html` name the old app's routes; the web route
  ignores them, so the templates need no change. Owner's check.
- **The `collections` table and `cards.collection_id` have no migration here.** The web app
  made them in the dashboard. Their `on delete` behaviour is unknown, which is why
  `deleteFolder()` empties a folder explicitly first. Worth a migration file that records
  the schema as it is, so a reviewer can read it.
- **`/v1/session` and the cookie helpers stay although no browser client lives here.**
  `lib/api/session-cookie.ts` and `viewer.ts` serve the cookie path of `/v1/session`; the
  web app may use it cross-origin or move to bearer. Removing it is a `/v2` question
  (R-API-008), not a cleanup.
- **`AUDIT.md` and `EINDCHECK.md` are sign-off notes for screens that no longer exist.** Left as they were; delete or move them.
- **Coverage is not measured since the split;** no floor is wired into `verify.sh`.

- **102 hand-typed refusals remain.** Each route moves to `apiError()`/`refuse()` when next opened.
- **`lib/core/collection/value-chart.ts` has a damaged sentence** in its header (lines 12–13). Left alone.
- **Both unmerged branches are superseded and neither merges as-is.**
  `origin/bartdunweg/catalog-wide-search-index` (582 files, predates the `src/` move) built
  cross-set search as a Postgres index on a weekly cron; what shipped queries pokemontcg.io live
  with a five-minute cache. The local index is still the better answer if that dependency ever
  becomes a problem. `origin/bartdunweg/check-tailwind-conversion` restores the removed Notion
  integration. Deleting them is a person's call.
- **dev-standards rule-count contradiction persists at v0.27.0.** The `CONVENTIONS.md`
  template says there is no rule-count ceiling; `verify.sh.template` still fails above 15
  rules. `scripts/verify.sh` runs every clause of the `conventions` check except the count and
  says so. Upstream fix `bartdunweg/dev-standards#45` is open; put nothing back here when it
  merges.
