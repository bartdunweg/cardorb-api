# State

Where this project stands, for whoever (human or agent) picks it up next.

## Now

Full Tailwind CSS migration completed. All 13 hand-written CSS files under
`app/styles/` that could be migrated have been: `card-shell.css`,
`errors.css`, `form.css`, `signin.css`, `settings.css`, `modal.css`,
`layout.css`, `tabbar.css`, `base.css`, `components.css` (slimmed to `.btn`
and the shared "GLASS CONTROL"/"CONTROL" recipe), `cards.css` (2,624 → ~1,470
lines, holding only cross-file selector hooks and ADR-0013-style
conditionally-overridden properties), and `landing.css` (deleted entirely,
692 lines, single consumer `app/page.tsx`). `poke-holo.css` and the
`pages.css` reduced-motion kill-switch are documented, permanent exceptions.

Key new shared components/helpers from the `cards.css` pass:
`FormField.tsx`, `SigninShell.tsx`, `SettingsPanel.tsx`, `tabbarClasses.ts`,
`cardsPageClasses.ts`, `segmentedClasses.ts`/`trackClasses.ts`,
`MenuDetails.tsx` (dropdown shell for `FilterMenu`/`ViewMenu`), `Sheet.tsx`
(bottom-sheet shell for `FilterSheet`/`ViewSheet`), `cardModalClasses.ts`.

Two structural bugs were found and fixed mid-migration, both documented as
ADRs and worth reading before touching this area again:
- **ADR-0012**: a cascade-layers ordering bug meant every Tailwind
  margin/padding utility added since the migration started was silently
  losing to legacy CSS (`gap`-based spacing was unaffected, which is why it
  wasn't visible in screenshots). Fixed by `@layer theme, base, legacy,
  components, utilities;` in `globals.css`.
- **ADR-0013**: an unconditional Tailwind utility can beat a still-legacy-CSS
  conditional override (a media query or ancestor selector) regardless of
  specificity, because Tailwind utilities always win the cascade-layer
  contest. Found twice (tabbar dead branch, cards-rail/cards-main pane-swap)
  and became a standing checklist item for the rest of the migration: audit
  every property for a conditional override elsewhere before making it an
  unconditional Tailwind class.
- **ADR-0014**: a class can have consumers beyond the "obvious primary" file
  (loading skeletons, duplicate render branches for owner/public variants) —
  grep the whole app for every migrated-away class name before considering
  it done.
- **ADR-0015**: `FilterOptions.tsx`/`ViewOptions.tsx`'s shared `facet-*` rows
  deliberately stay CSS-styled by ancestor (dropdown vs. sheet) rather than
  gaining a Tailwind variant prop — that split was already the right design,
  documented in the component's own top-of-file comment.

`build-quality` (Interface/Accessibility/SEO/Performance) run against this
session's work: all four Approve, no findings.

A refactor pass preceded the Tailwind work, working through every candidate
from the original survey:

1. Mechanical dedup in `lib/api/guard.ts` and the `/v1` auth routes.
2. `lib/core/cards.ts` split by concern into `matching.ts`/`artwork.ts`/
   `cardmarket.ts` (`docs/decisions/0003-split-lib-core-cards.md`).
3. `lib/core/catalogue.ts`'s raw TCGdex HTTP calls split into
   `tcgdex-client.ts` (`docs/decisions/0004-split-lib-core-catalogue.md`) —
   `setCatalogue`/`unstable_cache` stayed in `catalogue.ts` on purpose, per
   the eslint `CACHE_OWNERS` leash.
4. `app/components/CardsView.tsx` (1,940 lines): `CardItem` and `Segmented`
   split into their own files (`docs/decisions/0005-split-cardsview.md`).
   Verified with a running `npm run dev` and a request to
   `/user/bartdunweg` (200, clean render, no hydration error) — this
   workspace has no `NOTION_TOKEN`, so the actual card grid with real data
   was not exercised.

Merged into that same branch: a concurrent, much larger piece of work that
had already landed on `main` — a Tailwind migration, a design-token system
(`lib/design/`), and a new signed-in app shell (`app/(app)/`, `AppShell`,
`AppSidebar`/`AppTabBar`, `CollectionScreen`/`DashboardScreen`) that gives
`CardsView` new `chrome`/`scope` props and moves `eraYears`/`label` into
`lib/core/eras.ts`. The two efforts touched adjacent but non-overlapping
parts of `CardsView.tsx` (their `chrome`/`scope`/`eras.ts` work vs. this
session's `CardItem`/`Segmented` extraction); the one real conflict was
resolved by keeping both removals. Decision records `0001`/`0002` on `main`
were the landing-page work; this session's records were renumbered `0003`–
`0005` to not collide. `docs/changelog.md` (main's ad hoc file) was folded
into this session's `docs/CHANGELOG.md`/`changelog.d/` convention.

`npm run check` is green throughout (typecheck, tests, lint).

Since then, in this session: signup no longer collects a username. It's
generated server-side (`generateUsername()` in `lib/core/account.ts`, an
adjective+noun+digits scheme, checked against the same taken/reserved logic
the form used to rely on) in `app/api/v1/signup/route.ts`, with a five-attempt
retry loop before falling back to a 503. `SignUpForm.tsx` is down to
email+password, `useSession.ts`'s `signUp` dropped its `username` param.
Settings' existing username-change flow (`ProfileSettings.tsx`, `POST
/api/v1/username`, `claim_username` RPC) needed no changes.
`docs/decisions/0006-generated-username-at-signup.md` and
`docs/changelog.d/2026-08-14-generated-username-signup.md` record it.
`npm run check` is green.

Since then, in this session: a public "latest pull" endpoint for the portfolio
site. `CollectionRow.acquiredAt`/`excluded` (already stored, already sorted on
in `listRows()`) now flow through `buildCollection()` onto `Variant`
(`lib/core/cards.ts`), a new `latestPull(sets)` picks the newest non-excluded
printing and returns a curated (price-free, purchase-data-free) shape, and
`GET /api/v1/public/[username]/latest-pull` serves it with a hard-coded
`Access-Control-Allow-Origin: *` (independent of `guard.ts`'s allowlist, since
this route has no auth/cookies to protect). `docs/decisions/0014-public-latest-pull-endpoint.md`
and `docs/changelog.d/2026-08-15-public-latest-pull-endpoint.md` record it.
`npm run check` is green.

## Open

- `cards.css` is now 1,365 lines (from 2,927 at the start of the migration),
  holding only cross-file selector hooks (GLASS CONTROL/CONTROL recipe,
  `.sheet`/`.filter-menu-panel` ancestor styling for `FilterOptions.tsx`'s
  shared rows) and ADR-0013-style conditionally-overridden properties.
  Nothing further identified as migratable.
- Two background-agent worktrees from an earlier, session-limit-interrupted
  run are still on disk with no real changes in them:
  `.claude/worktrees/agent-a568e0bdb54c88794`,
  `.claude/worktrees/agent-ae477e6a88902e074`. Not cleaned up yet — ask
  before removing.
- This workspace has no `NOTION_TOKEN`/Postgres credentials, so the live
  verification this session did (browser screenshots, `getComputedStyle`
  checks) exercised the shell/toolbar/dialogs but never the real card grid
  with real data — worth a pass with credentials at some point.

The generated-username signup flow also hasn't been exercised in a running
`npm run dev` + browser session (no `NOTION_TOKEN`/Supabase credentials
confirmed in this workspace) — only `npm run check` and code inspection
verified it. Worth a real signup-and-confirm pass before shipping.

The new `/api/v1/public/[username]/latest-pull` endpoint is unit-tested with
mocked `getCards`/`ownerOf` but hasn't hit real Notion/Postgres data via
`npm run dev` (same credentials gap). Worth a real `curl -i` against a live
collection — including marking a card `excluded` and confirming it drops out —
before the portfolio site is pointed at it.

## Next session

Ask what's next. The Tailwind migration is complete.
