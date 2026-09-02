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

This session, on `claude/api-only`: **the web tool came out.** Gone: every page, `features/`,
`components/`, `hooks/`, `utils/`, `providers/`, `styles/`, `lib/design/`, `proxy.ts`,
Playwright, Tailwind, Untitled UI and the `@untitledui-pro/icons` package — so `.npmrc` and
`NPM_TOKEN` went too and `npm ci` needs no secret. Left: 32 route handlers, `lib/`, the
contract, `public/artwork/`. R-STRUCT-001..004/007, every R-STYLE and R-UI rule and
R-PLAT-003/004 were deleted; 20 rules remain. 450 tests, `next build` and lint pass here.

Previous release (#133, #134): the repository became the Card Orb API — `docs/api-design.md`,
`public/openapi.yaml` (34 operations, held to the file layout and the `Error` schema by
`src/app/api/openapi.test.ts`), the host-conditional rewrites in `next.config.ts`,
`src/lib/api/respond.ts`, rules R-API-006..008 and R-PLAT-005.

## Next

1. **Build the reference in `cardorb-web`** at `/docs/api`, in that app's theme, reading
   `https://api.cardorb.com/openapi.yaml` at build time. Then point `api.cardorb.com/` at it
   (the one rewrite in `next.config.ts`). The old renderer is in git at `40cc85d`,
   `src/app/docs/api/_components/reference.ts`, with its tests.
2. **Merge this branch, which redeploys.** `NEXT_PUBLIC_SITE_URL` on the `cardorb-api`
   project is `https://cardorb.com` again (the owner set it this session); it is inlined at
   build time (R-PLAT-002), so it takes effect on that deploy.
3. **Retire the passcode.** The iOS app already calls `api.cardorb.com/v1` (its PR #52). Watch
   the logs for `[deprecated] CARDS_TOKEN was used`, then drop the `passcode` scheme (design step 4).
4. **Decide the two stale branches** (see `## Open`).

## Open` sections pasted over each
other.

Previous release (#133, #134): the repository became the Card Orb API. `docs/api-design.md`
holds the design; `public/openapi.yaml` the contract (34 operations, held to the file layout
and the `Error` schema by `src/app/api/openapi.test.ts`); `/docs/api` the reference, rendered
at build time; `next.config.ts` the host-conditional rewrites; `src/lib/api/respond.ts` the
one error helper. Rules R-API-006, R-API-007, R-API-008 and R-PLAT-005 came with it.

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

- **Auth email links need `bartdunweg/cardorb-web`'s `/auth/confirm` PR merged.** One Supabase
  project serves all three clients and every template links to `{{ .SiteURL }}/auth/confirm`;
  the Site URL in the Supabase dashboard must be `https://cardorb.com`. Until that PR is live,
  confirmation and recovery links 404. The `next=` values in `supabase/templates/*.html` name
  the old app's routes; the web route ignores them, so the templates need no change.
- **`/v1/session` and the cookie helpers stay although no browser client lives here.**
  `lib/api/session-cookie.ts` and `viewer.ts` serve the cookie path of `/v1/session`; the
  web app may use it cross-origin or move to bearer. Removing it is a `/v2` question
  (R-API-008), not a cleanup.
- **`AUDIT.md` and `EINDCHECK.md` are sign-off notes for screens that no longer exist.** Left as they were; delete or move them.
- **Coverage is not measured since the split;** no floor is wired into `verify.sh`.

- **102 hand-typed refusals remain.** `apiError()`/`refuse()` exist; each route moves over when
  next opened. A sweep for its own sake was deliberately not done.
- **`lib/core/collection/value-chart.ts` has a damaged sentence** in its header (lines 12–13).
  Nobody now knows what it meant, so it was left alone.
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
