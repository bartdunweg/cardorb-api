# State

Where this project stands, for whoever (human or agent) picks it up next.

## Now

The public "latest pull" endpoint is fit for the portfolio site to embed. It
never needed an API key — a key shipped in a public site's JavaScript is not a
secret — but it was answering with the wrong card: `latestPull()` gated on
`excluded` and `acquiredAt` but not on `owned`, so a wishlist row counted as a
pull. Production was announcing an Umbreon that had never been bought and that
no catalogue has a scan for. Fixed, plus a rate limit, an `OPTIONS` handler and
a README section with a copy-paste snippet (ADR-0021).

**Open, and the one thing worth picking up next:
`docs/trainer-gallery-row-corrections.md`.** Auditing the artwork behind that
endpoint turned up 26 owned cards with no scan, 23 of them Trainer Gallery
cards whose rows are simply wrong — 21 filed under a number that belongs to a
different card, 2 under a reversed name. Both catalogues agree with each other
and with the printed card against the collection, so this is a data fix, not a
matching bug. The file lists every row and what it should say. Correcting them
restores each card's price, detail page and prev/next navigation as well as its
picture.

The code half of that is done (ADR-0022): gallery numbers now reach
pokemontcg.io, which publishes the galleries as sets of their own, and the
number is verified against that set's card list before the scan is believed —
so a wrong row keeps its empty slot instead of showing another Pokémon. It
changes nothing visible until the rows are corrected, by design. Limitless is
still never asked for a gallery number; that offset is still not guessable.

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

Since then, in this session: the Notion integration was removed entirely —
the collection is Postgres/Supabase-only now, no dormant fallback. Deleted
`lib/storage/notion.ts` + test, `lib/storage/secrets.ts` + test (existed only
to encrypt a stored Notion token), `app/api/v1/connections/notion/route.ts`,
`app/api/v1/import/notion/route.ts`, `scripts/import-notion.mjs`.
`lib/storage/collection.ts` lost its `Source`/`source()` switch and talks to
Postgres unconditionally; `lib/core/env.ts` dropped the `NOTION_TOKEN`/
`SECRETS_KEY` checks and promoted `NEXT_PUBLIC_SUPABASE_URL`/
`NEXT_PUBLIC_SUPABASE_ANON_KEY` to required. Settings > Import lost its "From
Notion" panel (`ImportSettings.tsx`, `app/settings/import/page.tsx`) — CSV
only now. `scripts/snapshot-collection-value.mjs`, which read Notion's
`created_time` for acquisition dates, was rewritten to read `acquired_at`
from Postgres directly (needs `--user <uuid>` now). A new migration,
`supabase/migrations/20260815120000_drop_notion_connections.sql`, drops the
now-unused `public.connections` table — **written but not yet applied to the
live database**; that needs `supabase db push` (or equivalent) run
deliberately against production. `docs/decisions/0021-remove-notion-integration.md`
and `docs/changelog.d/2026-08-15-remove-notion-integration.md` record it.
`npm run check` is green; a `npm run dev` boot confirmed the `[env]` warnings
now cover only the Supabase vars (this workspace still has none configured).

Since then, in this session: a long, iterative pass on the landing page and
the signed-in app shell, driven by a live back-and-forth rather than a single
brief — see ADRs 0023-0028 for the reasoning behind each. In short:

- **Landing page** (`app/page.tsx`): hero cut back to a single centred
  column (a two-column "value card" version was tried and explicitly
  reverted); every link to the public collection demo removed from the
  landing page and `/login` (ADR-0023); a stats row and an FAQ section
  added, informed by a competitive look at BindeX and Collectr's landing
  pages and `/pro` tier, filtered through this app's existing
  "premium personal collection, not a trading/social platform" positioning
  (`docs/decisions/0001-premium-personal-collection-landing.md`) — Trade
  Analyzer/Social/Marketplace-style features were deliberately not chased;
  a `comingSoon` tag on `FEATURES` entries not yet built (mobile scan, CSV
  export); copy tightened throughout at Bart's request ("nog een beetje
  cheesy... mag meer to the point").
- **Typography and colour** (ADR-0024): one font (Inter) instead of
  Satoshi+Inter, and the page background is white instead of `#fafafa` in
  light mode — both explicit instructions, both required follow-up fixes
  (heading line-height was tuned for Satoshi and clipped accents under
  Inter; several `max-w-[Nch]` headings wrapped a line longer than intended;
  one now-obsolete contrast-regression test removed).
- **Navbar** (ADR-0026): `app/components/Navbar.tsx`, sticky, shared by the
  landing page and the door screens (`SigninShell.tsx`), replacing two
  separate padding conventions and a `fixed` wordmark link with one
  component.
- **Sidebar** (ADR-0027, ADR-0028): the signed-in rail's fifty-plus-set
  inline list collapses to one "Sets" row linking to the `/collection/sets`
  page that already existed for this (`setsAsRow` prop, opt-in, legacy
  `/cards` unaffected); the rail's shadow reduced; a wordmark + black
  circular add button added to its header. Separately, found and fixed a
  real bug: the bottom tab bar was never actually hiding above 1000px — a
  third occurrence of the cascade-layers class of bug ADR-0012/0017 already
  documented, this time in a file whose own comment incorrectly claimed the
  old rule still worked.
- **Sign-in door screens**: `SigninShell.tsx` lost its `Card` wrapper (plain
  layout now); a two-column "cards drifting past" visual
  (`SigninVisual.tsx`) was built for `/login`/`/signup`, fixed (viewport
  height, real card scans instead of Pokédex sprites, styling), then
  explicitly removed again in the same session ("we houden het wel gewoon
  even in deze MVP heel minimaal") — the component and its keyframe were
  deleted rather than left dead.
- **Profile avatars** (ADR-0025, new): `profiles.avatar_url`, a public
  `avatars` Supabase Storage bucket, an upload route
  (`app/api/v1/profile/avatar/route.ts`) taking a client-resized 256×256
  PNG as a base64 data URL (matching `ImportSettings.tsx`'s existing
  JSON-body convention rather than introducing `multipart/form-data`), and
  an upload panel in `ProfileSettings.tsx`. Shown next to "Signed in as
  {name}" on the landing nav, falling back to an initial when unset.
  **Not applied to the live database** and not exercised against a real
  upload — same posture as the Notion-table drop below, and this
  workspace still has no working Supabase credentials.

`npm run check` is green throughout this pass.

## Open

- **Apply `supabase/migrations/20260815130000_profile_avatar.sql`** to the
  live database — new this session, not applied yet, same deliberate-
  go-ahead posture as the migration below.
- **Apply `supabase/migrations/20260815120000_drop_notion_connections.sql`**
  to the live database — not done yet, deliberately left for an explicit
  go-ahead since it drops a production table.
- This workspace's `.env.local` has `CARDS_TOKEN`/`OWNER_EMAIL` filled in but
  still needs real `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`
  (and `SUPABASE_SERVICE_ROLE_KEY` for the account-deletion path) pasted in
  by hand — not something to put in chat. Until then the app boots but the
  collection is empty and no account can be created.

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
