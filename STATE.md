# State

Where this project stands, for whoever (human or agent) picks it up next.

## Now

**PR #102 is merged. The component worklist below it is finished too** — see
"The adoption is done" further down, which is the current entry. Everything from
here to that heading is the history that led to it and is left as written.

Read FB-0013 through FB-0016 before deciding anything is out of scope: the
standing rule is that Untitled UI wins, and only the identity (ADR-0061 — the
holo effect, the orb) or a contrast measurement earns an exception.

**The Untitled UI rebuild is on `bartdunweg/untitled-ui` (PR #102), unmerged, and
the last commit is the only one that has not been photographed.** Sixty-plus
commits, `verify.sh` exits 0, and every step before the chart was checked against
thirty-three screenshots.

### Where it got to

    cards.css        1,169 -> deleted
    components.css     236 -> 57      (two @keyframes and a reduced-motion block)
    tokens.css          39 tokens -> 11, all of them this app's layout measures
    stylesheets          8 -> 2       (the theme, and poke-holo.css)
    Card Orb tokens    620 -> ~100    reads in components
    app/components/  -> components/custom/, beside Untitled UI's four trees

Hand-written component styling: none.

### The audit that should have happened sooner

Asked whether the landing page's badge was an Untitled UI component. It was not —
it was their *classes*, assembled by hand, and so were seven button recipes, five
checkboxes with a tick drawn as a rotated border, four avatars, a table, a radio
group and eleven `title=` tooltips. Converting tokens is not the same as using
components, and this branch conflated the two for a long time.

**Still hand-built, with the component sitting vendored and unused:**

  tooltips (11 places)     -> `tooltip`      `title=` is not keyboard-reachable
  segmented tracks (5)     -> `tabs`         would delete trackClasses.ts
  search/text inputs (4)   -> `input`
  SettingsSwitch           -> `toggle`
  avatar upload            -> `file-upload-trigger`
  empty states (4)         -> `empty-state`
  MenuDetails <details>    -> `dropdown`

All twelve components are installed. This is the work to continue with.
**Done — see "The adoption is done" below.**

### The chart is verified, and finding that out fixed the harness

`CollectionValueCard` is Recharts now, with Untitled UI's chart helpers
(`charts-base`). Photographed and green.

Getting there found something worth keeping: `owner.spec.ts` masked `svg` — every
one on the page. So the rail's icons have been magenta blocks in every baseline
this harness ever took, and **no screenshot could have shown the chart changing
at all.** It was there because the chart used to be an `<svg>` full of live
figures; the figures are a hover tooltip now and the line comes from stored
snapshots, so it is stable. The mask is prices only.

Recharts is the only dependency this whole migration added, and it was a decision
rather than a default: Untitled UI has no chart component, only styling helpers
that sit on top of Recharts. The hand-drawn SVG it replaced was 146 lines here
plus 75 of geometry in `lib/core/value-chart.ts` — that file now has one
consumer for `points` and its `line`/`under` paths are dead.

### What keeps going wrong, and it is always the same shape

**A Tailwind utility beats a legacy CSS rule even when the legacy rule is the
conditional one.** Six occurrences, one of which — ADR-0064 — had reached
production: the toolbar's 900px wrap had been dead since the search field was
migrated. The fix is always to make the override conditional too, or `!` it.

The screenshots caught five regressions that typecheck, lint and 525 tests all
passed through. **Do not trust a green `verify.sh` on anything that moves a
rule.**

Running the harness (`playwright.config.ts` has the detail):

    npm run build
    # start the server from OUTSIDE the test shell — plain `&`, `nohup` and
    # `disown` all still die with it, and macOS has no setsid
    VISUAL_BASE_URL=http://127.0.0.1:3231 npm run visual

A dead server photographs the app's own error boundary and reports a 28% pixel
difference, which reads exactly like a CSS regression. Open the diff before
believing it.

### Two decisions waiting

- **The toolbar wrap (ADR-0064)** — restored because it is the documented intent,
  but it changes what a tablet looks like.
- **The fixed type scale** — text no longer stretches with the viewport, because
  Untitled UI's scale is fixed and Card Orb's was `clamp()`. One commit to
  revert.

### Not to be repeated

A sidebar rewrite onto `SidebarNavigationSimple` was built and reverted: it
changes the responsive model (they use a slide-over below `lg`, this app turns
the rail into its own screen below 1000px) and renders `<UntitledLogo />` with no
slot for a name. `AppSidebar` builds on `NavList` instead.

`components/custom/` cannot be emptied. Nothing in it is dead — measured — and
`CardItem`, `CardsView`, `TiltScan` and `Wordmark` have no Untitled UI
counterpart. That directory is what it is for.

## The adoption is done (2026-08-21, workspace `ashgabat`)

The worklist under "The audit that should have happened sooner" is finished.
Every vendored component now has a consumer or a written reason not to
(ADR-0065, ADR-0066).

    tooltips        -> base/tooltip          (2 of them; the third stays a title=, on purpose)
    segmented rows  -> base/button-group     trackClasses.ts deleted
    inputs          -> base/input InputBase  cardAddInputClassName deleted
    SettingsSwitch  -> base/toggle ToggleBase native checkbox kept
    avatar upload   -> base/file-upload-trigger
    empty states    -> application/empty-state
    the two menus   -> DialogTrigger + Dropdown.Popover, MenuDetails.tsx deleted

**Two live bugs came out of it, and neither was migration debt.**
`.cards-empty` and `.cards-filter-badge` were defined in no stylesheet at all —
they went with `cards.css` and the names stayed in the JSX. Three empty states
and the active-filter count had been rendering unstyled. Both are fixed by the
adoption itself.

**Three things worth carrying forward:**

- **`selected:` and `pressed:` were undefined variants project-wide.** Untitled
  UI writes its components against React Aria's data attributes and turns them
  into variants with a plugin this repo does not have; Tailwind v4 skips an
  unknown variant silently. The chosen segment carried `aria-checked="true"`
  and `data-selected="true"` and painted pure white, same as its neighbours.
  The already-adopted table had the same dead class. Both are `@custom-variant`
  in `scripts/gen-tokens.mjs` now. **If a vendored component looks stateless,
  check the variant exists before checking anything else.**
- **"Vendored and unused" is not a neutral state.** `base/file-upload-trigger`
  had two faults that would each have thrown on first render — a
  `React.Children` call in a file that never imports `React`, and an import of
  `@react-aria/utils`, which is not a dependency here. `@ts-nocheck` (ADR-0062)
  and the eslint-ignore hid both, and no consumer meant nothing ever ran it.
  Two earlier audits counted these components as done work.
- **Untitled UI's neutral tints do not survive a pure-white page.** Their
  selected background measured 1.04:1 against unselected, and their own Tabs
  tint measured 1.04:1 too, where WCAG 1.4.11 asks 3:1. `bg-brand-solid`
  measures 4.96:1. ADR-0065 has the numbers.

- **A vendored component's *imports* are part of what you are adopting.**
  `application/empty-state` also exports illustration and avatar-collage parts
  and imports `@untitledui/file-icons` (2.5 MB on disk) at the module's top
  level. Adopting it for five sentences put 62 kB of gzipped SVG on the client;
  `Header`'s background-pattern barrel added 20.8 kB more. Measured against a
  build of `origin/main` in a worktree: 562.7 -> 655.3 -> 595.7 kB gzipped
  client JS. The unused parts are cut. **Check the import list before adopting
  the next one.**

**Left deliberately, and both are recorded in ADR-0066:** `application/tabs`,
`metrics`, `section-headers` and `app-navigation` end with no consumer and are
kept; and about sixteen dead legacy class names (`cards-head-title`,
`cards-set-meta`, `view-menu-panel`, `cards-view-trigger`, …) are written onto
elements and read by nothing. Every one of those sits on an element that
carries real utilities too, so none is a third `.cards-empty` — but they are the
camouflage that hid the two real ones. Deleting them is its own change.

**The harness gained two checks and lost a blind spot.** `owner.spec.ts` used
to say the filter rows were "converted but unphotographed" because neither menu
would open reliably from a click; both are a real `<button>` opening a real
`role="dialog"` now, and the filter panel has a baseline for the first time.
`visual/upload-owner.spec.ts` is new and is not a screenshot — a picture of an
upload button proves nothing about it.

**Still needs a human, signed in.** Everything below was verified against a real
session and a production build, but three things a screenshot cannot show:
the public-link switch in its *on* state (it is off in every baseline, so the
toggle's brand fill is uncovered), a real avatar actually uploading end to end
(the chooser opening twice is checked, the upload is not), and the two menus on
a phone — the sheet handoff is `display:none` and untouched, but unseen.

## The signed-in navbar is a pill (2026-08-17, workspace `castries`)

`/` and `/app/ios` used to greet a signed-in visitor with the sentence "Signed in
as {name}" in the navbar's right slot, in duplicated JSX. It is one component now
— `app/components/ViewerPill.tsx` — drawing an avatar and the name inside a
rounded `--color-border` pill, with "Signed in as … — open dashboard" moved into
`aria-label`. Feedback FB-0012.

Two things worth carrying forward:

- **A long name used to push the pill off a phone.** A display name is allowed 60
  characters and `Navbar.tsx`'s right column was a plain `1fr`, which will not go
  below its content. It is `minmax(0,1fr)` with `min-w-0` on the slot now, and the
  name ellipsizes at `min(45vw,220px)`. Nothing else in that bar was long enough
  to have found this.
- **It was verified twice, and the second way is the one to copy.** First by
  temporarily stubbing `currentViewer()` behind an env check (reverted, nothing
  committed) — enough to measure light/dark and both avatar branches, not enough
  to prove a session reaches it. Then properly, with the `visual/auth.setup.ts`
  storage state that landed on `main` the same afternoon: a real session against
  a production build showed the pill on both pages at 1280 and 390, with
  `document.scrollWidth` equal to the viewport, so nothing overflows.
- **Watch the port when using that harness from a worktree.** `playwright.config.ts`
  has `reuseExistingServer: true` on 3210, and a parallel worktree
  (`kuala-lumpur`) was already serving *its* build there — the first run
  photographed the other checkout and failed for the right reason by luck.
  `VISUAL_BASE_URL=http://127.0.0.1:<own port>` against your own `next start` is
  the way to be sure whose app you are looking at.

## Open

- **Card detail, avatar upload, and signup still need a real signed-in
  browser pass.** `/api/v1/public/[username]/latest-pull` was confirmed
  live this session (`curl -i` against the running dev server, real data:
  returned an actual card, "Zarude", with the CDN-image proxy and CORS
  header both correct) — that one is done. The rest need an authenticated
  session, which this session could not create: no browser extension
  connected in this workspace, and entering a password on the user's
  behalf is out of scope regardless. `OWNER_USER_ID` (the legacy
  `x-cards-key` compatibility path in `guard.ts`) is also unset in
  `.env.local`, so there was no way to authenticate a `curl` request
  either. Needs a human pass: sign in, click through `/collection/card/[id]`
  with a real card, upload an avatar in Settings > Profile, and run a real
  signup once.

Since then, on `main` (merged from a parallel branch, not this session's own
work): a full security review of the platform (auth/guard logic, every
`app/api/` route, secrets/config/dependencies via three parallel Explore
sweeps). Overall posture held up well — constant-time token comparison, RLS
as the real authorization layer, parameterized queries throughout, a real
CSP/HSTS/Permissions-Policy header set, anti-enumeration on
login/signup/password-reset, no leaked secrets in git history. Three
concrete gaps fixed: `GET /api/v1/public/[username]/collection` had no rate
limiter (the one public route without one, and the most expensive); `email`/
`password` settings routes had none either, unlike shape-identical
`session`/`signup`; and `recentImports()` relied solely on RLS with no
`user_id` filter in the query itself, unlike every other function in that
file. `docs/decisions/0023-security-review-rate-limit-gaps.md` and
`docs/changelog.d/2026-08-15-security-review-rate-limit-gaps.md` record it —
note this session also has its own, unrelated `0023` (landing page,
`0023-landing-drops-public-collection-links.md`); the two arrived on
parallel branches and collided the same way `0014` and `0021` already had
before this, so the number was left doubled up rather than renumbering
seven cross-referencing files against a moving target. Several other
security findings were left as documented, accepted tradeoffs rather than
fixed — see that ADR for the list (verbatim Postgres error messages to
clients, CSP `unsafe-inline`, the legacy `CARDS_TOKEN` path, in-memory rate
limiting, `x-forwarded-host` trust).

Since then, in this session: the tabbar's mobile add button changed from an
accent-coloured circle to the same black `--btn-primary-bg` the sidebar's
add button and every other primary action use, on explicit instruction —
trading away the original design's "one ink for where you are (the selected
pill, already black), one for what you can do" distinction. Documented
inline in `cards.css` rather than a full ADR, since it's a straightforward
colour swap with the tradeoff spelled out in the same comment.

Since then, in this session: mobile tab bar refinement, in one thread of
back-and-forth feedback, all recorded in `ADR-0030`:

- The last slot ("Settings", gear icon) is now "You", showing the account's
  avatar (or initial, matching `CardsSidebar`'s footer pattern) instead —
  wired up in `AppTabBar.tsx`, the actual signed-in mobile bar (`CardsView`'s
  own inline `CardsTabBar` is dead for owners; it early-returns before
  reaching that markup).
- Fixed the active-tab pill, then the bar itself, reading flush against the
  screen's edges on narrow phones instead of matching their own padding: a
  fourth *and* fifth instance of the `ADR-0012`/`0017`/`0028` cascade-layer
  pattern in the same file. First, `min-w-max` on `tabbarPagesClassName` so
  the mobile width cap can't squeeze the track narrower than its content.
  That alone didn't fully fix it — the bar's own `<=640px` side padding was
  still reserving ~64px per side for a theme toggle this route never
  renders (`cards.css`'s attempt to cancel that reservation loses the same
  cascade fight), so forcing the track to its full content width was then
  pushing it past the nav's own shrunk available space, sometimes past the
  viewport. Fixed by baking the correct (`space-4`, not
  `space-3+control-h+space-3`) padding/cap directly into `tabbarClasses.ts`
  instead of relying on `cards.css`'s losing override.
- Every tab is now a fixed, equal width (was sized to its own label). Two
  static pixel guesses (`w-16`, then a computed `w-[72px]`) both still
  clipped "Dashboard" to "Dashbo…" — caught by a real screenshot the user
  sent. Stopped guessing: `CardsTabBar.tsx` now measures every label's real
  `scrollWidth` in a `useLayoutEffect` and sets the widest as a `--tab-w`
  CSS var the slots all read, re-measured on `document.fonts.ready` (same
  pattern `useSlidingPill` already used). Label truncation stays as a safety
  net, not the primary mechanism. The same screenshot also showed the active
  pill touching the add circle beside it directly — the track's flex
  children had no gap between them at all — fixed with `gap-1` on
  `tabbarPagesClassName`. Two more rounds after that: first a (wrong-
  direction) guess that the leftmost/rightmost slot needed *more* horizontal
  padding than vertical (`py-2 px-3`) to beat the capsule's rounded corner
  visually eating into the inset; then the actual ask — one equal amount of
  space everywhere (edges, inter-item gap, and the item's own vertical
  inset) — settled by using `p-2` **and** `gap-2` together (both 8px).
- **Settings now lives inside the app shell** (`app/settings/**` moved to
  `app/(app)/settings/**`, except `password/`, kept standalone — see below):
  sidebar and tab bar stay on screen there now, matching `/dashboard`,
  `/collection`, `/wishlist`. This completes something `app/(app)/layout.tsx`
  and `AppSidebar.tsx` already assumed ("/dashboard, /collection and
  /settings share one shell") but `app/settings/layout.tsx` never actually
  did — it was its own separate, unwrapped layout the whole time.
  `app/settings/password/page.tsx` was deliberately left where it was: it
  renders the same `SigninShell` chrome as `/login`/`/signup` and is reached
  from an unauthenticated password-recovery link as well as a signed-in
  action, so nesting it under `AppShell` would have doubled up chrome and
  swallowed its own expired-link error message.
- `CardsDashboard.tsx` and `SetIndex.tsx` (`/collection/sets`) had no visible
  page title anywhere (both the shell's and `CardsView`'s own `<h1>`s are
  `sr-only`) — added one to each. Landed twice: first as ad-hoc Tailwind
  classes eyeballed to match Settings' own new heading, then switched (both,
  plus Settings) to the literal `.cards-main-title` class (`cards.css`) once
  asked to make it consistent with the rest of the app — that's the one style
  `CardsView`'s own `<MainTitle>` already uses for Collection/Wishlist/set/
  era, so this stopped being a second, close-but-not-quite copy of it.

The measured-width fix above still clipped "Dashboard" once more on a real
device, root cause not conclusively pinned down. Rather than keep guessing:
added a `ResizeObserver` on the labels as a third trigger alongside mount +
`document.fonts.ready`, and — the part that actually guarantees the visible
symptom can't recur regardless of whether any JS path fires correctly —
widened `tabbarItemClassName`'s static fallback from a tight 72px estimate
to a deliberately generous 104px, so a device where none of the three JS
triggers work still doesn't clip the label.

The tabbar/Settings/Dashboard-title work was merged and deployed as PR #41
on explicit instruction ("oke fixen dan denk ik" — merge before the label
clipping was actually confirmed fixed, since it wasn't yet), and the
label-width hardening above followed as PR #43 off the same branch once the
clipping was confirmed still happening post-merge. Not yet confirmed with a
live signed-in screenshot after PR #43 — browser
automation in this workspace can't sign in, so this whole thread still needs
a human pass at ≤1000px on `/dashboard`, `/collection`, `/wishlist`,
`/settings` (and its subpages), and a check that `/settings/password` still
looks right reached both signed in and via a recovery link.

`npm run check` is green throughout all three threads.

Since then, in this session: the "Pokémon" tick-list filter facet was
removed from `CardsView.tsx` (state, tally, filter check, its entry in
`facets` and `activeFilters`) — search already covers finding cards by
Pokémon name, so the facet was redundant UI over a several-hundred-row list.
`CardsPokedex`'s "jump to this Pokémon" already went through the search
query, not this facet, so it needed no change. Two comments that named the
facet as their example (`CardsView.tsx`'s "long tick-lists" comment,
`Sheet.tsx`'s scroll-design comment) were reworded.
`docs/decisions/0030-remove-pokemon-name-filter.md` and
`docs/changelog.d/2026-08-15-remove-pokemon-name-filter.md` record it.
`npm run check` is green.

Since then, in this session: the add-card dialog (`CardAddDialog.tsx`) was
rebuilt twice, the second time correcting the first within the same
session. First pass (ADR-0030, now superseded): Set reordered above Name, a
debounced live thumbnail preview scoped to the typed set, via TCGdex's
existing-but-unused `/api/v1/catalog/search`. Immediate correction from
Bart — "1 invoerveld voor alles" (FB-0005) — wanted one search bar,
matching name/number/set/type at once, no "pick a set first" gate. That
gate existed for a real reason (TCGdex only resolves one set at a time), so
meeting the correction meant a different data source, not just relaxing
the client check: `/api/v1/catalog/search` now runs on pokemontcg.io
instead (`lib/core/ptcg-search.ts`, new), one query across name/number/
set.name/types with the term escaped against Lucene injection. A live
probe against the real API during this session confirmed the query shape
works but also found it genuinely fragile unauthenticated — ten rapid
requests produced five 500/502s — so a new optional `POKEMONTCG_API_KEY`
env var was added (sent as `X-Api-Key` when set; not yet obtained, since
getting one means Bart signing up at pokemontcg.io himself) alongside a
retry, a 5-minute per-query cache, and, the real mitigation, a persistent
"Enter it by hand" fallback to the classic Name/Number/Set fields — a card
pokemontcg.io hasn't indexed can still be added, unconditionally.
`CardAddDialog.tsx` is now a four-state flow (search → live results →
selected-match summary, or → manual fields), with explicit focus
management between states (an accessibility pass found focus silently
dropping to `<body>` on every transition, since fixed via refs) and a
single persistent `role="status"` region for "Searching…"/"No matches"
(previously two conditionally-mounted nodes, which some screen readers
would not reliably announce). `docs/decisions/0031-add-card-single-search-bar.md`
(supersedes `0030`), `docs/feedback/0005-add-card-should-be-one-search-bar.md`,
and `docs/changelog.d/2026-08-15-add-card-single-search-bar.md` record it.
`npm run check` is green throughout. Not exercised with a real click-through
in this session — same signed-in-browser gap as everything else below.

- **Card detail, avatar upload, and signup still need a real signed-in
  browser pass** (earlier session's work) — see above; unchanged by the
  security-review merge.
- **This session's tabbar/"You" tab/equal-width-tabs/Settings-in-shell/
  Dashboard-title work also needs a real signed-in browser pass** at
  ≤1000px, for the same reason (no credentials available to browser
  automation in this workspace) — see above for the specific routes.

Since then, in this session: a quick correctness fix, caught by Bart asking
"'charizard 151' zou dan ook moeten werken toch?" — it didn't yet.
`buildQuery()` in `lib/core/ptcg-search.ts` was treating the whole typed
string as one wildcarded phrase, which pokemontcg.io's own query parser
splits on whitespace regardless, so a two-word search didn't mean what it
looked like it meant. Now each word gets its own name/number/set/type OR
clause and the clauses are joined by a bare space, which a live check
against the real API confirmed pokemontcg.io's parser treats as AND
between parenthesised groups — "charizard 151" narrows from 108
name-matched Charizards down to exactly the 3 printed in the set named
"151". Capped at 6 words. `npm run check` is green.

Since then, in this session: a second correction, immediate again — "enter
it by hand moet geen optie zijn, het is meer gebruik advanced filters"
(FB-0006). The "Enter it by hand" manual fallback from the previous entry
is gone entirely: there is no path left in `CardAddDialog.tsx` that writes
a name/set nobody confirmed against the catalogue. In its place, "Advanced
filters" — Name/Number/Set/Type as their own fields, still a live search
(`lib/core/ptcg-search.ts` gained `buildFilterQuery()`/`SearchFilters`
alongside the quick-search `buildQuickQuery()`; `/api/v1/catalog/search`
switches into filter mode whenever any of those four params is present).
Explicitly accepted, not softened: a card pokemontcg.io has not indexed can
no longer be added through this dialog at all — the exact consequence
ADR-0031 had named as a reason to keep a fallback, chosen anyway.
`docs/decisions/0032-add-card-advanced-filters-not-manual-entry.md`
(supersedes `0031`'s fallback design, not its pokemontcg.io backend choice),
`docs/feedback/0006-add-card-no-manual-entry-escape-hatch.md`, and
`docs/changelog.d/2026-08-15-add-card-search-and-advanced-filters.md`
record it. A follow-up accessibility check confirmed focus still moves
correctly on the new quick/advanced toggle and found no label collisions.
`npm run check` is green.

Since then, in a later session: Bart reported searching "Charizard" in the
shipped dialog returned no results — a query independently verified against
the live pokemontcg.io API, repeatedly, to return 100+ real prints. Live
reproduction wasn't captured (tailed Vercel's production logs across two
windows; nothing came through in either, and no browser session was
available), but the code had a sufficient, confirmed explanation regardless:
`searchCards()` (`lib/core/ptcg-search.ts`) retried once and then returned
`[]` on exhausted retries — identical in shape to a genuine zero-match
search — against a host measurably flaky unauthenticated (5 failures out of
10 rapid requests, measured earlier the same day). Investigated first via a
research/design agent pair rather than guessing straight into code: one
Explore pass confirmed the failure/empty-result collapse and the theming
system (no dark-mode bug found in the dialog's code, contrary to a separate
report — needs a screenshot if it recurs), one Plan pass worked out the
fix's tradeoffs (throw vs. richer return shape; dedicated `loadingMore`
state) before anything was written.

Fixed: `searchCards()` now retries 3 times (was 2) and throws once
exhausted, instead of returning `[]`. The route
(`app/api/v1/catalog/search/route.ts`) catches that and answers `502` with
`{ error: "search-unavailable" }`, distinct from the existing `400`.
`CardAddDialog.tsx` gets a `searchFailed` flag (true only on an actual
failure) shown as "Search is temporarily unavailable." plus a "Try again"
button. Also added, from the same conversation: pagination —
`searchCards()`/the route/the dialog all pass a `page` number
(live-verified against the real API before relying on it), and a "Show more
results" button appends further pages under a broad query instead of
capping at 20, staying inside the existing modal (a separate results page
was explicitly considered and rejected). Two ideas from the same
conversation were deliberately deferred, not built: a one-click instant-add
from a search thumbnail (kept as click-to-fill-then-confirm, preserving the
review-before-write posture ADR-0022/0032 already established), and a
"browse a whole set including unowned cards" catalogue feature (a real,
separate piece of work — `/collection/sets` today only ever shows sets the
collection already has a card in). **That second one is built now — see
"Browse the whole catalogue" under Now, and ADR-0037.**
`docs/decisions/0033-add-card-search-failure-and-paging.md` and
`docs/changelog.d/2026-08-16-add-card-search-failure-and-paging.md` record
it. `npm run check` is green. Deployed and immediately real-world tested by
Bart (first live browser test this whole thread has actually gotten) — he
caught a second, genuine bug within a minute: typing showed "no matches"
almost instantly, before a request could possibly have gone out. Cause:
`searching` only flipped `true` inside the *debounced* fetch's own
`setTimeout` callback, so for the whole `SEARCH_DEBOUNCE_MS` (300ms) window
between a keystroke and the request actually firing, `searching` was still
`false` and any leftover `matches` from a moment ago was still `[]` — which
is exactly the "no matches" condition. Fixed by adding a second, `0ms`
timer in the same effect that flips `searching` (or resets everything, if
the query became inactive) on the very next tick, independent of the
debounced fetch timer — still not a synchronous `setState` in the effect
body (the lint rule this whole file's search effect is built around), just
a much shorter deferred one. `npm run check` is green; redeployed.

- **A `POKEMONTCG_API_KEY` would meaningfully derisk the new add-card
  search, and matters more than it did — there is no manual-entry fallback
  left.** The unauthenticated pokemontcg.io rate limit was observed failing
  under a rapid burst this session, and since ADR-0032 a search that can't
  reach pokemontcg.io means a card genuinely can't be added, not just
  "search is a bit less convenient." The app has no key yet. Getting one
  needs Bart himself (account creation on a third-party site).
- **Card detail, avatar upload, signup, and the new add-card search all
  still need a real signed-in browser pass.** (Card detail/avatar/signup
  from an earlier session; the add-card preview is this session's own.) See
  above for what each needs; the add-card preview specifically needs: pick
  a real set, type a partial name, confirm thumbnails render and a click
  fills Number and highlights, confirm the highlight clears on further
  edits.
- The Notion-connections-table drop and the profile-avatar migration are
  both confirmed applied to the live database (checked directly via
  `supabase db query --linked` for the former, `supabase migration list`
  for the latter) — nothing outstanding on the migrations front.
- This workspace's `.env.local` now has working
  `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`/
  `SUPABASE_SERVICE_ROLE_KEY` — the credentials gap earlier sessions
  recorded here is resolved.
- `cards.css` is now 1,365 lines (from 2,927 at the start of the migration),
  holding only cross-file selector hooks (GLASS CONTROL/CONTROL recipe,
  `.sheet`/`.filter-menu-panel` ancestor styling for `FilterOptions.tsx`'s
  shared rows) and ADR-0013-style conditionally-overridden properties.
  Nothing further identified as migratable.

Since then, in this session: rarity and type stop being Notion-descended,
hand-typed facts and become catalogue-sourced (`docs/decisions/0030-tcgdex-source-of-truth-for-rarity-and-type.md`).

This session's first version built its own TCGdex set-picker → search →
detail flow for `CardAddDialog.tsx`, with two new routes
(`GET /api/v1/catalog/sets`, `GET /api/v1/catalog/cards/[id]`). Merging with
`main` surfaced that a parallel session had, the same day, already rebuilt the
same dialog around a single pokemontcg.io-backed search box (ADR-0030/0031/0032
on `main`, superseding each other within that session per direct feedback —
`docs/feedback/0005`/`0006`: "1 invoerveld voor alles", "enter it by hand
should not be an option") — a materially better UX (search across
name/number/set/type at once, an "Advanced filters" fallback, no manual-entry
escape hatch) than this session's set-first TCGdex flow. Flagged to Bart
rather than force-merged; his answer was to resolve the conflict rather than
pick a side. Resolution: `main`'s dialog and its pokemontcg.io search
(`lib/core/ptcg-search.ts`) won outright; this session's set-picker routes and
the `getCardDetail()` `localId` addition were deleted as redundant. What
survived from this session's version, applied on top of `main`'s dialog:
Rarity and Type are no longer an editable input/toggle chips once a match is
picked — they are shown, sourced strictly from `selected.rarity`/`.types`,
matching the "no manual entry" principle `docs/feedback/0006` already
established for the card's identity fields, extended here to these two.
`selectMatch()` was also fixed to stop falling back to a previous pick's
`draft.rarity` when a new match has none — a leftover from when the field was
still editable, which would have shown a stale value next to a "read-only"
label.

`scripts/backfill-rarity-types.mjs` **has been run against the live database**
(`--user 3fe9b080-2279-480b-a6ec-4fa58611c8cb --write`, Bart's explicit
go-ahead): 978 rows updated, 22 written to
`docs/rarity-type-backfill-corrections.md` for having no confident TCGdex
match. Its first version tried to resolve a row to a TCGdex id by reading a
running build's `/cards` flight payload the way `snapshot-collection-value.mjs`
does — but that page now requires a real signed-in session cookie (`/cards`
itself now just redirects to `/collection`, and the app shell's auth check is
cookie-only, not the legacy `x-cards-key` header), which this session could
not obtain. Rewritten to call the same matching primitives
`buildCollection()` uses directly — `resolveSetIds`/`fetchSet`/`numberForms`
from `lib/core/catalogue.ts`/`tcgdex-client.ts`/`util.ts`, `sameCard()` from
`lib/core/matching.ts` — run via `tsx` (Node 22+; `@supabase/supabase-js`
needs a native `WebSocket`, absent on this machine's default Node 20, so the
script must run under the `v24.19.0` nvm install). Deliberately not routed
through `setCatalogue()`: that wraps the same walk in `unstable_cache`, which
throws ("incrementalCache missing") outside a running Next.js request —
confirmed by trying it directly. This turned out to be a better shape for a
one-off script than the flight-payload approach anyway: no build, no server,
no session needed.

**The dry run surfaced a real finding, not a rubber stamp**: all 978 matched
rows differed from TCGdex, not a handful. `cards.rarity` had been doing double
duty — for chase cards it held TCGdex-shaped tiers ("Illustration Rare",
"Ultra Rare"), but for ordinary cards it held which *foil variant* the owner's
physical copy was ("Non-holo", "Holo", "Reversed Holo"), a fact TCGdex has no
field for at all. Overwriting blind would have both destroyed that variant
information and broken `poke-holo.css`'s foil effect, whose selectors were
keyed on exactly those three words. Flagged to Bart before writing anything;
his answer was explicit — TCGdex is the source of truth, apply it fully, the
foil-variant fact is an accepted casualty. `poke-holo.css`'s `data-rarity`
selectors were rewritten to the tier vocabulary both catalogues broadly share
(`common`/`uncommon`/`promo` → no foil; `rare`/`double rare`/anything
containing `holo`/`amazing rare`/etc. → the middle tier; anything containing
`illustration`/`ultra`/`hyper`/`secret`/`rainbow`/`shiny`/etc. → full
strength), matched by substring rather than an exact string per tier —
partly for future TCGdex tiers this collection doesn't hold yet, partly
because the merge below means new cards' rarity now comes from pokemontcg.io
instead, which spells some of the same tiers differently ("Rare Ultra" vs.
"Ultra Rare"). Verified after writing: `npm run check` green; a direct
Postgres read confirmed a sample (`White Flare` #001–#003) landed correctly.

**Not verified in a real browser** — no Chrome extension connected in this
workspace, same gap earlier sessions (including the parallel one merged in
below) hit. Neither the read-only Rarity/Type summary nor the rest of
`CardAddDialog.tsx` has been exercised live this session.

## Settings became one page (2026-08-16, workspace `edinburgh`)

`/settings` was an index of four link rows leading to four sub-routes. Bart:
"niet iedere keer vier cards die je per card moet open klikken … dat moet
gewoon in één keer zichtbaar zijn," plus "een pagina zoals de andere." It is
now a single full-width page — `app/(app)/settings/page.tsx` fetches viewer,
profile and import history (the last two in one `Promise.all`) and stacks
Profile / Account / Import / Appearance under a `<h2>` each, using the new
`SettingsSection` in `SettingsPanel.tsx`. `SettingsPanelTitle` became an
`<h3>`; the index's row primitives were deleted with the index;
`app/(app)/settings/layout.tsx` and its `max-w-[640px]` clamp are gone
(header folded into the page). The four sub-routes are deleted and redirected
permanently to `/settings` from `next.config.ts` — a confirmation email
already in an inbox points at `/settings/account`, and
`app/api/v1/email/route.ts` now sends new ones to `/settings`.
`/settings/password` is untouched and still standalone. Panels span the pane,
so `SettingsInput` and the Appearance radio row are capped at `max-w-[26rem]`.
A `build-quality` pass also gave four inputs an accessible name they never had
(display name, username, new email, CSV file) — a panel heading is not a name.
FB-0007 and ADR-0034 record it. `npm run check` green; the four redirects
verified live (308) against `npm run dev`.

One follow-up in the same session, on Bart's instruction: **deleting the
account is its own section at the bottom of the page**
(`DeleteAccountSettings.tsx`), not the fourth panel in Account. In one long
scroll it sat between an email field and a theme picker. `AccountSettings.tsx`
lost its `username` prop with it.

**Built twice, resolved in favour of the other branch.** Bart also reported the
landing navbar greeting everybody with "Signed in as Bart", and this branch
fixed it — `Viewer.displayName` plus a `displayNameOf()` helper in
`lib/api/viewer.ts`, with FB-0008 and ADR-0035 to match. Merging `origin/main`
before the PR landed brought in PR #49, which had solved the same problem more
thoroughly the same day (`ownerLabel()` in `lib/core/owner.ts`, `OWNER_NAME` and
`PUBLIC_USERNAME` deleted outright, ADR-0034-collection-named-after-its-owner).
This branch's version was deleted whole — helper, test, both records, the
changelog fragment — rather than merged alongside it: two functions answering
"what is this person called" is exactly the drift `lib/core/owner.ts` exists to
prevent. Worth noticing as a process fact, not just a merge: two workspaces
picked up the same complaint within an hour of each other.

## Next session

- **The tab bar's fix has not been seen in a real signed-in session.** ADR-0050's
  numbers are real measurements against the dev build, but of the *public*
  profile bar with the signed-in shape (four labelled slots plus the add circle)
  injected into it by script — the same no-session gap as every item below. What
  a human should still do: sign in on a phone, tap between all four tabs and
  watch the pill both slide and resize in one motion, and confirm the skeleton's
  capsule does not visibly change width when the real bar replaces it (its four
  placeholder labels are hard-coded to the real labels' widths for exactly that).
- **Re-run `--seed` on another day to recover the 2026-06-17 point**, then delete
  `lib/core/collection-value.generated.json`. The migration and the first two
  points are already in (see "Now"); this is only about the middle reading, which
  the Internet Archive refused to serve correctly on 2026-08-16. Until it lands,
  that file is the only copy of it — do not delete it, and do not hand-insert the
  value from it (computed before copies counted).
- **`/dashboard` has not been seen with the new value figure.** Collection value
  now multiplies by copies held, so the number moves up by whatever the
  duplicates are worth. Worth one look that it still fits its tile — it is
  rendered with proportional figures at `--fs-h2`, and a five-digit euro amount
  was already the widest thing in that row.
- ~~Check a real `/user/<name>` payload after the ADR-0045 change.~~ **Done** on
  production, 2026-08-16 — see "Now". Both the page's RSC payload and the public
  API were read and carry no purchase price, note, condition or quantity.
  The **iOS app** was checked too, by cloning `bartdunweg/cardorb-ios`: it never
  calls the public endpoint, so it is unaffected. Nothing outstanding here.
- **The new loading fallback has not been seen in a signed-in browser.** No
  session in this workspace, `chrome-devtools` was blocked by another
  automation Chrome holding its profile, and the Chrome extension was not
  connected — the same gap as the three items below. It was verified by
  rendering the fallback on a throwaway public route and screenshotting it
  headless at 1440/900/375 (route deleted again), so the markup and the
  geometry are right in isolation. What is **not** verified is the thing that
  matters: hard-load `/dashboard`, `/settings` and `/collection/sets` with the
  collection slowed down, and confirm nothing moves between the fallback and
  the real page — specifically that the rail's rows land on the same
  y-position and the tab bar does not change height.
- **Nothing in this repo has been rendered below 500px this session, or in
  several.** Chrome headless clamps its window to a 500px minimum on macOS, so
  a `--window-size=375` screenshot lays the page out at 500 and crops the image
  to 375 — which looks exactly like a horizontal overflow bug and is not one.
  This cost a wrong finding before it was caught by measuring
  `document.documentElement.scrollWidth` instead of looking at the picture.
  **Measure, do not read screenshots, for anything narrower than 500px.**
- **`--tab-w` is now computed in `app/(app)/loading.tsx` and inherited in
  `CardsTabBar.tsx`.** The slot width's 104px default is only safe because
  `CardsTabBar` measures the widest label on mount and writes a smaller value
  back; a fallback has no effect, so it held 104 and the end slots hung out of
  the capsule below ~620px (ADR-0044). Anything else that ever draws this bar
  without `CardsTabBar` behind it needs the same formula. The formula's
  behaviour below 500px is arithmetic, not measured.
- **`app/cards/[id]/page.tsx`'s soft-404 explanation is now marked unverified.**
  It blamed `app/cards/loading.tsx` for making the route stream; that file does
  not exist and the route is outside the `(app)` group, so it does not inherit
  that group's fallback either. Whatever produces the soft 404 today has not
  been re-checked. Low stakes (the route is noindex and behind the proxy) but
  the comment should not be trusted as a diagnosis.
- **`/app/ios` has never been looked at.** It was verified over HTTP only —
  status, metadata, heading order, sitemap, the `/app` redirect, `.sr-only`
  present in the served CSS — because the Chrome extension was not connected
  again this session. Needs: the hero at ≥1000px / 641–1000px / ≤640px, the
  three placeholder frames collapsing to one column at 800px, and a tab
  through the hero confirming the inert download button takes focus and shows
  its ring. Same gap as the two items below; it is now three threads deep.
- **The inert download button's contrast is exempt, not good.**
  `.btn[aria-disabled="true"]` is `opacity: .55`, which on `.btn--primary` in
  light mode composites to roughly white on `#7c7c7c` — about 4.2:1, under AA.
  WCAG 1.4.3 exempts inactive components so this is not a violation, and the
  state is also carried by the visible note (not colour alone), so it was left
  alone rather than special-cased: the rule is shared with ~20 other call
  sites and changing it globally is its own piece of work. Worth a look once
  the page has been seen.
- **`/settings` has not been seen signed in.** No session in this workspace and
  browser automation can't create one — the same gap the tabbar thread above
  hit. Needs: all four groups on screen at once, one control exercised per
  group (theme, public-link switch, CSV picker, email field), and the widths at
  ≥1000px / 641–1000px / ≤640px. This subsumes the older "verify `/settings`
  and its subpages" item — there are no subpages any more.
- **`CardAddDialog.tsx` needs a real signed-in browser pass**: search, pick a
  result, confirm Rarity/Type show as read-only text matching the picked
  card, submit, confirm the row lands correctly. Not exercised live this
  session (no browser extension connected) — true of both the pokemontcg.io
  search itself (already merged from the parallel session) and this
  session's read-only Rarity/Type change on top of it.
- **`docs/rarity-type-backfill-corrections.md`** lists 22 rows the backfill
  could not confidently match to a TCGdex id — the same worklist shape
  `trainer-gallery-row-corrections.md` used for artwork. Worth checking
  whether any of these are the same 23 Trainer Gallery rows that worklist
  already covers.
- **`poke-holo.css`'s substring-matched tiers are a best guess, not verified
  against pokemontcg.io's actual rarity strings** — this session confirmed
  TCGdex's vocabulary against the live API (via the backfill) but not
  pokemontcg.io's. Worth spot-checking a newly-added card's `data-rarity`
  against the foil effect it gets once the browser pass above is possible.
