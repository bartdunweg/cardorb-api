# State

Where this project stands right now. Read it at the start of a session; update it at the end.
This file is deliberately short — it orients, it does not document. The rules that apply now
live in `CONVENTIONS.md`.

Rewrite it in place. This file has no history worth keeping; the history is in git.

Keep it under 100 lines, and keep at most one section about a previous release. `CLAUDE.md`
loads this file on every request, so its length is a cost paid continuously.

## Now

Card Orb is live at cardorb.com and serves the iOS client an API. Nothing is half-built.

This session, on branch `claude/cardorb-api-design-8xy6rt` — **the repository is now the
Card Orb API, and the web tool is one of its two clients.** The owner chose: API is the
product, web stays; own clients only; OpenAPI 3.1 in the repo; design plus a first step.

- **`docs/api-design.md`** — the design: host, contract, error shape, versioning, auth,
  migration path, and what was deliberately not done.
- **`public/openapi.yaml`** — the contract, 34 operations across 27 paths, every route under
  `src/app/api/v1`. `src/app/api/openapi.test.ts` holds it against the file layout both ways
  and every 4xx/5xx to the `Error` schema.
- **`/docs/api`** — the reference, rendered from the contract at build time as plain HTML
  (no third-party script; the CSP allows none). `_components/reference.ts` holds the
  decisions, with tests; `page.test.tsx` renders the page with the chrome stubbed.
- **`api.cardorb.com`** — host-conditional rewrites in `next.config.ts`: `/v1/*` → `/api/v1/*`,
  `/` → `/docs/api`. Inert until the domain is attached (see `## Open`).
- **`src/lib/api/respond.ts`** — `apiError()`, `refuse()` and the shared `REFUSALS`.
  `NO_DATABASE_CONFIGURED` now reads from there; the four wordings of it are one; the
  account route's 413 says `Payload too large`; the health check's 503 carries an `error`.
- **Rules:** R-API-006 (error shape), R-API-007 (contract), R-API-008 (`/v1` by addition
  only), R-PLAT-005 (the host is a rewrite, not a deployment).
- Added `yaml` (MIT) as a dependency, for the contract test and the reference page.

`npm run check` in this workspace: prettier, theme check, tests (547 + 19 new) and lint pass.
Typecheck and `next build` could not run here: the private `@untitledui-pro/icons` registry
needs `NPM_TOKEN`, which this workspace does not have. See `## Open`.

## Next

1. **Attach the host.** Add `api.cardorb.com` to the Vercel project and a CNAME at
   Cloudflare, DNS-only (R-PLAT-001). Then `curl https://api.cardorb.com/v1/health` and
   open `https://api.cardorb.com/` — it should be the reference.
2. **Run `./scripts/verify.sh` on a machine with `NPM_TOKEN`** before merging this branch.
   The build-time read of `public/openapi.yaml` in `/docs/api` is what most needs a real
   `next build` behind it.
3. **Move the iOS app's base URL** to `api.cardorb.com` (`bartdunweg/cardorb-ios`), then
   watch the logs for `[deprecated] CARDS_TOKEN was used` and retire the passcode.
4. **Keep pulling decisions out of `CardsView.tsx`** (1,633 lines; eight `useMemo` bodies
   with no test) — unchanged from the previous session.
5. **Decide the two stale branches and the CI billing block** (see `## Open`).

## Open`).
- **Applied the small fixes those agents found:** the `CardsDashboard` headings now use
  `text-xl font-title-strong` (R-STYLE-003/004); the README API summary no longer overstates the
  guard against the bootstrap/health/cron routes; `@vitest/coverage-v8` is installed so coverage
  is measurable (72% lines / 50.6% branches / 572 tests).
- **Added R-BUILD-001** — `npm run check` during iteration, full `verify.sh` only before commit/PR.

`./scripts/verify.sh` exits 0 across all checks.

## Next

1. **Keep pulling decisions out of `CardsView.tsx`.** Still 1,633 lines; eight bodies hold a
   decision no test reaches: `eraOptions`, `valueOptions`, `ownershipOptions`, `activeFilters`,
   `dex`, `dexShown`, `visibleSets` (all `useMemo`) and `activeTab` (a derived `const`). Same move
   as `cards-filter.ts` — a plain module beside the component.
2. **Decide the two stale branches** (see `## Open`). Deleting them is a person's call.
3. **Decide the CI billing block** (see `## Open`). Turning Actions back on needs account access.

## Open

- **`api.cardorb.com` is not attached yet.** The rewrites are in place and inert; attaching
  the domain is the owner's step (Vercel + Cloudflare DNS-only). Until then the host does not
  resolve and the design's step 2 has not happened.
- **This branch was not built here.** `next build` and `tsc` fail in this workspace on the
  missing private icon package, not on this change; `npm run lint`, prettier and vitest pass.
  A `verify.sh` run with `NPM_TOKEN` set is owed before merge.
- **102 hand-typed refusals remain.** `apiError()`/`refuse()` exist and the drifting wordings
  are gone, but most routes still build `{ error }` by hand. Each moves over when next opened;
  a sweep for its own sake was deliberately not done.
- **CI is a paper gate right now.** GitHub Actions billing is blocked, so pushes to `main` run no
  real check — every run fails in 3–5s with an empty step list, and `main` deploys straight to
  production. `./scripts/verify.sh`, run by a person or an agent, is the only real gate. See the
  `github-actions-billing-blocked` memory. `.github/workflows/check.yml`'s header comment
  overstates what protects production while this holds.
- **R-STRUCT-007 has known violations.** The eight bodies under `## Next` item 1 are decisions
  still inside a component. The rule is right and the code has not caught up.
- **Two vendored avatar sub-components have no consumer** — `avatar-add-button.tsx` and
  `avatar-company-icon.tsx` under `src/components/base/avatar/` are exported but never rendered
  (R-UI-007: not known to work). They cannot be hand-deleted: `base/` is CLI-regenerated and
  R-UI-003 forbids editing it by hand, so a delete would be reverted on the next `npm run ui:add`.
  Tracked here rather than "fixed" wrongly.
- **`CardsView.tsx` is the biggest untested surface.** Coverage is 72% lines overall, but branch
  coverage is 50.6% and this file carries the bulk of the untested decisions. No coverage floor is
  wired into `verify.sh` yet — that is a separate decision, not an omission.
- **`section-headers` adoption was reverted — it 500'd the Settings page (RSC boundary).**
  `SettingsSection` lives in `SettingsPanel.tsx` (no `"use client"`) and is rendered by
  `page.tsx`, a Server Component. `SectionHeader` is an object exported from a `"use client"`
  module, so across the server→client boundary `SectionHeader.Root` is `undefined` → "Element type
  is invalid" at render. `next build` missed it because `/settings` is `force-dynamic` and is never
  rendered at build; only a real request triggers it. Reverted to the plain `<h2>` and removed the
  vendored component. The lesson: a compound component from a `"use client"` module may only be
  consumed inside a Client Component (that is why `FilterBar.Root` in the client `CardsView` is
  fine). Reintroduce section-headers during the Settings redesign, in a client context. The
  full-page settings templates stay unfit regardless: all eight are standalone `layout: sidebar`
  pages that bring their own navigation plus a tiptap editor and qr codes.
- **`filter-bar` (free) adopted as the toolbar container.** `FilterBar.Root` now wraps the
  collection toolbar in `CardsView.tsx` (children stay flat, so the responsive wrap rules, the
  search flex-basis and the CSS-only menu/sheet swap all hold). Its `filter-dropdown-menu` half was
  a query-row builder (field/operator/value) — a different interaction model from the faceted
  toggles here — so it was removed rather than left as dead vendored code. No behaviour or visual
  changed. Notably, Untitled's own filter dropdown uses react-aria `DialogTrigger`, not
  `Dropdown.Root` menu semantics, which validates `MenuPopover`'s choice.
- **`sidebar-navigation-base` NavItem does not map — not adopted.** Card Orb's rail row
  (`CardsSidebar.tsx:437`) is a `<button aria-pressed>` pane selector with a bespoke `::after`
  sliding pill deliberately shared with the tab bar as one visual language; Untitled's `NavItem` is
  an `<a href>` route link with its own filled active background. Forcing it would downgrade the
  semantics, split the rail/tab-bar language, and vendor a 25-file nav shell — a product-degrading
  change with no clean subset. Left bespoke on purpose unless the owner decides otherwise.
- **R-STYLE-016 enforcement is narrower than its wording.** `contrast.test.ts` measures one
  control-border token and one placeholder; the rule says "every control boundary and both
  placeholders". Either add the second assertion or narrow the rule — a rule-vs-code gap.
- **Playwright's `public` project selects zero tests.** It matches `cards-css.spec.ts`, deleted
  when that migration finished, so `playwright.config.ts:110` runs nothing and says nothing.
  Measured: `npx playwright test --project=public --list` → `Total: 0 tests in 0 files`.
- **`lib/core/collection/value-chart.ts` has a damaged sentence** in its header (lines 12–13),
  around "the paths had gone unread since for what was left behind and why it is gone". Something
  was lost in an earlier edit; nobody now knows what it meant, so it was left alone.
- **Both unmerged branches are superseded and neither merges as-is.**
  `origin/bartdunweg/catalog-wide-search-index` (582 files changed, predates the `src/` move) built
  cross-set search as a Postgres index refreshed by a weekly cron; what shipped queries
  pokemontcg.io live with a five-minute cache. The local-index idea is still the better answer if
  that dependency ever becomes a problem — that is the part worth keeping, not the branch.
  `origin/bartdunweg/check-tailwind-conversion` still restores the removed Notion integration.
- **dev-standards rule-count contradiction persists at v0.27.0.**
  `templates/CONVENTIONS.md.template` says "There is no rule-count ceiling. Freshness is the
  brake, not size."; `templates/verify.sh.template` still fails above 15 rules. This project has 50
  and follows the template. `scripts/verify.sh` runs every clause of the `conventions` check except
  the count, and says so in a comment. Upstream fix `bartdunweg/dev-standards#45` (drops the clause)
  is still open; put nothing back here when it merges, because the count is going away, not the
  exception.
