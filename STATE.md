# State

Where this project stands right now. Read it at the start of a session; update it at the end.
This file is deliberately short — it orients, it does not document. The rules that apply now
live in `CONVENTIONS.md`.

Rewrite it in place. This file has no history worth keeping; the history is in git.

Keep it under 100 lines, and keep at most one section about a previous release. `CLAUDE.md`
loads this file on every request, so its length is a cost paid continuously.

## Now

Card Orb is live, and since 2026-09-02 it is two repositories on two Vercel projects:

- **This repository, `bartdunweg/cardorb-api`** — the API, at `api.cardorb.com` (Vercel
  project `cardorb-api`). `/v1/*` is the API, `/` is the reference, and `/v1/health` answers
  `{"ok":true,"database":"reachable"}`. Design step 2 (attach the host) is done. The web tool
  in `src/app/(app)` is still built and served on this host, but no domain the owner hands out
  points at it any more.
- **`bartdunweg/cardorb-web`** — the new web app, at `cardorb.com` (Vercel project `cardorb`,
  created 2026-09-02; pnpm, Next 16, its own `/api/v1` and its own standards). Its docs call
  this repository "the previous app".

This session, on `claude/project-name-cardorb-api`: the npm package is `cardorb-api` (it was
`cardorb`, which is also what named every deployment URL `cardorb-<hash>`), and this file was
rewritten — the previous version had two `## Next` and two `## Open` sections pasted over each
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

- **The web tool is still here until `## Next` item 1 ships.** `CLAUDE.md`, `README.md` and
  `docs/api-design.md` now say so; `README.md`'s tour of the signed-in screens and its
  environment table still describe the previous app and go with it.
- **The README's examples and the reference's canonical point at `cardorb.com`.**
  `cardorb.com/api/v1/…` now answers from `cardorb-web`'s own API, not this one, and
  `cardorb.com/docs/api` and `/openapi.yaml` are 404 there. The examples should read
  `api.cardorb.com/v1/…`; the canonical follows `## Next` item 2.
- **CI is red on every run, `main` included.** `npm ci` fails with `401 Unauthorized` from
  `pkg.untitledui.com`: the `NPM_TOKEN` secret in the repository's Actions settings is invalid
  or expired. Until it is refreshed, `./scripts/verify.sh` run by a person is the only gate, and
  `main` still deploys straight to production.
- **102 hand-typed refusals remain.** `apiError()`/`refuse()` exist; each route moves over when
  next opened. A sweep for its own sake was deliberately not done.
- **R-STRUCT-007 has known violations in `CardsView.tsx`** (1,640 lines): `eraOptions`,
  `valueOptions`, `ownershipOptions`, `activeFilters`, `dex`, `dexShown`, `visibleSets` and
  `activeTab` are decisions no test reaches. Branch coverage is 50.6% overall, mostly here. No
  coverage floor is wired into `verify.sh`; that is a separate decision.
- **Two vendored avatar sub-components have no consumer** — `avatar-add-button.tsx` and
  `avatar-company-icon.tsx` under `src/components/base/avatar/` (R-UI-007). They cannot be
  hand-deleted: `base/` is CLI-regenerated (R-UI-003). Tracked here rather than "fixed" wrongly.
- **`section-headers` adoption was reverted — it 500'd the Settings page.** A compound
  component exported from a `"use client"` module is `undefined` when rendered from a Server
  Component, and `next build` cannot catch it on a `force-dynamic` route. Reintroduce it during
  a Settings redesign, inside a Client Component.
- **`filter-bar` (free) is the toolbar container; `sidebar-navigation-base` was not adopted.**
  The rail row is a `<button aria-pressed>` pane selector sharing one sliding pill with the tab
  bar; Untitled's `NavItem` is a route link with its own active background. Left bespoke on
  purpose unless the owner decides otherwise.
- **R-STYLE-016 enforcement is narrower than its wording.** `contrast.test.ts` measures one
  control-border token and one placeholder; the rule says every control boundary and both
  placeholders. Add the assertion or narrow the rule.
- **Playwright's `public` project selects zero tests.** It matches `cards-css.spec.ts`, deleted
  when that migration finished. Measured: `--project=public --list` → `Total: 0 tests in 0 files`.
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
