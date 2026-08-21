# Docs map

This directory is Card Orb's memory: decisions, feedback, and the changelog. See the
root `CLAUDE.md` for how and when to write to it.

- `decisions/` — decision records, one per non-obvious choice. Immutable; superseded,
  never rewritten. Numbered `NNNN-slug.md`.
- `feedback/` — feedback records, quoted verbatim before interpretation. Numbered
  `NNNN-slug.md`.
- `CHANGELOG.md` — generated from fragments in `changelog.d/`. Never hand-edited.
- `changelog.d/` — one fragment per user-visible change, so parallel worktrees don't
  conflict on a single changelog file.

## Starting points

- `decisions/0000-adopt-memory-system.md` — why this repo has this structure.
- `decisions/0001-premium-personal-collection-landing.md`,
  `decisions/0002-subtle-free-european-positioning.md` — the landing-page rebuild.
- `decisions/0003-split-lib-core-cards.md`, `decisions/0004-split-lib-core-catalogue.md`,
  `decisions/0005-split-cardsview.md` — the `lib/core`/`CardsView` refactor.
- `decisions/0006-generated-username-at-signup.md` — why signup generates a username
  instead of asking for one. `decisions/0035-welcome-flow-for-new-accounts.md`
  closes the consequence it left open: a four-step, every-step-skippable welcome
  flow at `/welcome` (name, avatar, sharing, first cards), gated on a new
  `profiles.onboarded_at` column. It also explains why "what do you collect" is
  deliberately not asked, and why an empty collection and an unreachable one
  finally say different things.
- `decisions/0007-shared-form-components-over-css-classes.md`,
  `decisions/0009-settings-modal-tailwind-notes.md` through
  `decisions/0013-tailwind-entry-point-scope.md` — the Tailwind CSS migration's
  first phase (forms, settings, modal, tab bar, base components, the entry-point
  fix). `decisions/0012-cascade-layers-fix.md` is **worth reading first**: a
  cascade-layers bug meant every margin/padding Tailwind class added since the
  migration started was silently losing to legacy CSS; screenshots looked fine
  because `gap` was unaffected.
- `decisions/0008-per-variant-inventory-fields-and-bearer-rls-fix.md` — per-variant
  inventory fields, and the bearer-token/row-level-security bug the iOS client's
  extension work uncovered.
- `decisions/0014-cache-assembled-collection.md` — why the assembled collection is
  cached across requests, not just its rows and catalogue inputs, and the Vercel
  Fluid CPU cost that surfaced it.
- `decisions/0014-public-latest-pull-endpoint.md` — the public "latest pull"
  endpoint for the portfolio site, and `decisions/0021-latest-pull-owned-only.md`
  — why it has no API key (a key in a public site's JavaScript is not a secret)
  and why it was answering with a wishlist card.
- `decisions/0022-gallery-artwork-via-pokemontcg.md` — **worth reading before
  trusting a card number.** Trainer Gallery scans now come from pokemontcg.io,
  but the audit behind it found that 23 gallery rows in the collection are filed
  under a number belonging to a different card. The lookup is name-checked for
  exactly that reason. `trainer-gallery-row-corrections.md` beside this file is
  the worklist, and should be deleted once those rows are fixed.
- `decisions/0017-cards-rail-pane-swap-fix.md` through
  `decisions/0020-card-add-input-styling-regression.md` — the Tailwind
  migration's second phase, finishing `cards.css` and `landing.css`.
  `0017` is a follow-up bug from `0012`: an unconditional Tailwind property beat
  a still-CSS conditional reset (rail/main pane toggle) — the rule to avoid it
  for the rest of the migration. `0018` is the same failure mode found again:
  a class can have consumers beyond the "obvious primary" file (loading
  skeletons, duplicate render branches). `0020` is a genuine regression found
  in a later audit: CardAddDialog's inputs had silently lost their
  glass-control styling because the class they read had gone dead — a caution
  about verification blind spots on routes that need a signed-in session.
- `decisions/0033-add-card-search-failure-and-paging.md` — a search that failed
  and a search that genuinely matched nothing used to look identical in
  `CardAddDialog.tsx`; now `searchCards()` throws instead of swallowing, and
  the dialog shows a distinct "Search is temporarily unavailable" with retry,
  plus a "Show more results" button instead of a hard 20-result cap.
- `decisions/0034-settings-one-page-not-an-index.md` — why `/settings` stopped
  being an index of four sub-routes and became one full-width page with every
  section stacked. Read it before adding a settings section: there is no
  sub-route to add one to, and `/settings/*` (except `password`) is a set of
  permanent redirects in `next.config.ts`.
- `decisions/0034-collection-named-after-its-owner.md` — **read before adding
  anything that names a person.** `OWNER_NAME`/`PUBLIC_USERNAME` are gone; whose
  a collection is and what to call them come from the profile being rendered,
  via `ownerOf()` (`lib/core/collection.ts`, now returning the whole profile) and
  `ownerLabel()`/`collectionTitle()` (`lib/core/owner.ts`). The app had been
  multi-user for a while with one env var still titling every public page after
  the deployment's owner — production had a second public profile served under
  the wrong name. Also: signup now asks for a name, optionally, and
  `display_name` stopped being seeded with the generated username.
- `decisions/0035-og-image-is-dynamic-not-revalidated.md` — a 500 that only
  production could show: `revalidate` on a route that reads cookies cannot be
  rendered statically, and one hardcoded `generateStaticParams` entry had been
  hiding it. Read it before trusting a green `npm run build` on anything whose
  static-vs-dynamic rendering matters.
- `decisions/0037-browse-the-whole-catalogue.md` — **read before touching
  anything that lists sets or cards you do not own.** `/collection/browse`,
  `/api/v1/catalog/sets` and `/api/v1/catalog/sets/:id` answer "what is in this
  set" from pokemontcg.io (not TCGdex — its list endpoint has no rarity or
  types), and mark ownership with a pure in-memory join in
  `lib/core/ownership.ts` over raw rows, never `buildCollection()`. It also
  explains why `/api/v1/catalog/sets` exists again after being deleted once, and
  why `POKEMONTCG_API_KEY` should now be set.
  `decisions/0038-browse-scans-come-from-tcgdex.md` is its follow-up and the
  one with the numbers in it: browse's card scans are swapped to TCGdex's WebP
  after the fact (198 kB PNG → 26 kB, a set goes 40 MB → 5 MB), the set logos
  deliberately are not, and the measurement for both is written down.
- `decisions/0021-remove-notion-integration.md` — why the Notion integration
  was deleted outright, now that Postgres is confirmed as the real store,
  rather than kept as a dormant fallback.
- `decisions/0032-add-card-advanced-filters-not-manual-entry.md` — **read this
  one, not `0030` or `0031`.** The add-card dialog opens on one search bar
  (name/number/set/type at once, via pokemontcg.io — `lib/core/ptcg-search.ts`);
  the fallback for a hard-to-phrase search is "Advanced filters" (explicit
  Name/Number/Set/Type fields, still a search), not manual unmatched entry —
  a card pokemontcg.io hasn't indexed genuinely can't be added through this
  dialog, a known, explicit tradeoff. Both `decisions/0030-add-card-live-catalogue-preview.md`
  and `decisions/0031-add-card-single-search-bar.md` were superseded within the
  same session, each per direct correction
  (`docs/feedback/0005-add-card-should-be-one-search-bar.md`,
  `docs/feedback/0006-add-card-no-manual-entry-escape-hatch.md`): kept for the
  record, but their manual-entry-fallback design is not what the app does now.
- `decisions/0030-tcgdex-source-of-truth-for-rarity-and-type.md` — a second,
  unrelated `0030`, left doubled up rather than renumbered (the same collision
  `0014` and `0021`/`0023` already had, per `STATE.md`): why rarity and type
  stop being hand-typed/Notion-descended facts. The existing
  collection was backfilled from TCGdex (`scripts/backfill-rarity-types.mjs`);
  going forward, rarity and type in `CardAddDialog.tsx` are read-only, filled
  in from whichever match the search above (pokemontcg.io) picked, not typed —
  the same "no manual entry" principle `0032` already established for the
  card's identity, applied to these two fields specifically.
- `decisions/0042-ios-app-page.md` — **read before touching `/app/ios` or the
  landing page's shared parts.** The iPhone app has its own page now, and its
  download button is deliberately inert (`aria-disabled`, with a visible note)
  because the app is not on the App Store — not a bug, and the record says
  exactly what to change on shipping day. Also: why `/app` is a *temporary*
  redirect, why the JSON-LD carries no `offers`, and the two extractions out of
  `app/page.tsx` (`components/marketingClasses.ts`, `components/MarketingFooter.tsx`)
  that both public pages now share.
- `decisions/0042-one-privacy-policy-for-app-and-site.md` — a second, unrelated
  `0042`, left doubled up rather than renumbered, as `0014`, `0021`, `0023`,
  `0030` and `0034` already are. **Read before adding a public page, or before
  answering "what do we send to whom".** `/privacy` and `/terms` are two of the
  five routes allowed to be indexed (the root layout `noindex`s everything by
  default), and the record lists what each third party actually receives —
  including that the website runs Vercel Web Analytics while the iOS app runs
  none, which a draft written from the iOS side got backwards.
  `decisions/0043-terms-of-use.md` is its follow-up: `/terms`, written for the
  operator rather than for Apple, and the reason the "prices are information,
  not advice" and "not affiliated with The Pokémon Company" sections exist at
  all. Both pages share `app/components/LegalPage.tsx`; read it before adding a
  third long-form page.
- `decisions/0044-value-is-per-user-and-counts-copies.md` — **read before
  touching anything that puts a euro figure on screen.** The dashboard's
  "Value over time" chart used to import one committed JSON file generated for
  one account, so every signed-in account read the seed owner's history under
  its own value tile; it is `public.collection_value_snapshots` now, own-rows-only
  with no public branch, reached through `getValueHistory()` in
  `lib/core/collection.ts`. The record also covers three things found on the way:
  `scripts/snapshot-collection-value.mjs` had been broken for everyone since
  `/cards` became a redirect, the value figure never counted per-variant
  `quantity` (it does now, via `copiesHeld()`, and "Priciest cards" deliberately
  still does not), and the deprecated `x-cards-key` path answers with an empty
  series by design.
- `decisions/0045-public-collection-carries-two-variant-fields.md` — its
  follow-up, and **read it before adding a column to `cards`.** `stripPrices()`
  is `forPublic()` now: it nulled the price and left `variants` whole, so a
  public profile was publishing what its owner paid for every card, in what
  condition, graded how, with their private notes and how many they hold — on
  the API and inside the profile page's own HTML. The public path reads exactly
  two variant fields, `rarity` and `owned`, so the new shape is an allow-list of
  those two and a new column is excluded by default.
- `decisions/0046-loading-fallback-draws-shared-chrome-only.md` — **read before
  adding anything to `app/(app)/loading.tsx`.** It is the Suspense fallback for
  every signed-in route, because the slow await is in the group's layout, and it
  may therefore only draw what is identical on all of them: the frame, the rail,
  the bar, and one outline where the heading lands. It used to draw the old
  `/cards` page — a toolbar, two set panels, twenty card tiles and an `<h1>Cards</h1>`
  no screen has ever shown — which is what `docs/feedback/0010-...` reported.
  Anything route-specific goes in that route's own `loading.tsx` or nowhere. Read
  it with `0018`, which is this same file drifting once before.
- `decisions/0085-every-tab-is-the-width-of-the-widest.md` — **read before
  touching the mobile tab bar, and before looking for the add button in it.**
  The track is a grid of `fr` columns now, so every slot is the width of the
  widest label with no JavaScript measuring it; and the 40px add circle left the
  bar for the dashboard's title row, **deliberately and temporarily**, because
  four equal slots plus a circle do not fit a 360px phone. The record says what
  that costs (on a phone, adding a card is dashboard-only) and what would
  reverse it. Read it with `0050`, whose overflow diagnosis it keeps, and `0030`,
  which tried equal widths by measurement and kept clipping "Dashboard".
- `decisions/0048-the-orb-mark-on-the-web.md` — **read before touching anything
  that shows the product's name or its icon**, and **read its opening warning
  before starting any task in this repo.** Two workspaces built this from the
  same prompt twenty minutes apart; PR #68 merged the assets while the second
  was still writing a record claiming they did not exist. `origin/main` moves
  during a session. On the substance: the name is `<Wordmark />`
  (`app/components/Wordmark.tsx`) rather than type, in all four places it
  appears, and `/brand` is the source of truth for how the mark is *used* on the
  web — though not for the mark itself, which is *generated* by
  `Tools/GenerateAppIcon.swift` in the separate `cardorb-ios` repository and
  handed over as files.
  `decisions/0049-favicon-is-the-circle-not-the-tile.md` corrects one file that
  had already shipped, and carries the rule for picking a cut: the tile goes
  where something else rounds it off — an iOS home screen, an Android launcher —
  and the plain circle goes where the file is drawn as given, which is a browser
  tab. It also has the measurement behind the wordmark's `translate-y-[6.05%]`,
  and why the word beside it needs no matching nudge.
- `decisions/0053-memory-stays-in-docs.md` — **read before moving anything in
  this directory.** The shared standards keep a repository's memory in
  `.dev-standards/` from v0.11.0 onwards; this repository deliberately keeps
  `docs/`, and the record says why and what would void that choice.
- Root `README.md` — what Card Orb is, the API surface, production environment.
