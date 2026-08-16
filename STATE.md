# State

Where this project stands, for whoever (human or agent) picks it up next.

## Now

**Every value figure is per-user now, and counts copies (ADR-0044,** workspace
`kuala-lumpur`**).** Asked whether the collection's value is computed per user
from that user's cards. The "Collection value" tile always was. The **"Value
over time" chart under it was not**: `CollectionValueCard.tsx` imported
`lib/core/collection-value.generated.json`, one committed file generated for one
account, so every signed-in account saw the seed owner's line — a new signup with
three cards read "Collection value €12" with "Up €24,253 across 1,524 cards"
directly beneath. `/api/v1/value-history` served the same file to any
authenticated caller. There is a `public.collection_value_snapshots` table now,
own-rows-only with **no public branch** (unlike `cards_read` — a value series is
nothing but money and cannot be `stripPrices()`d), read through
`getValueHistory()` in `lib/core/collection.ts`.

Two things found on the way. **`scripts/snapshot-collection-value.mjs` had been
broken for everyone, including the owner**, since `/cards` became a redirect to
`/collection`: it scraped that page's RSC payload, an unauthenticated fetch
landed on `/login`, and it threw on zero cards. It asks `/api/v1/collection`
(with `--token <jwt>`) or the public endpoint now, and no longer needs a
production build on :3111 — `SITE` can point anywhere. And **the value never
counted per-variant `quantity`**: a card held three times was worth one of it, in
the tile and in the series both. `copiesHeld()` in `lib/core/cards-stats.ts` is
the one definition; "Priciest cards" deliberately still ranks per single copy.

Three things are **not done and need live credentials**:

1. **Nothing has been written to the new table.** Run
   `node scripts/snapshot-collection-value.mjs --user <owner-uuid> --seed`
   against a running site. Until then the owner's dashboard has no chart either.
2. **`lib/core/collection-value.generated.json` is still in the tree, imported by
   nothing, and should be deleted — but only after that seed run reproduces its
   three points.** Both historical points come from Internet Archive captures of
   Cardmarket's price guide; those are single points of failure and that file is
   currently the only other copy of December 2024. Expect `value` to come out
   *higher* than the old figures now that copies count, while
   `cards`/`priced`/`unpriced` should line up.
3. **The RLS check has not been made.** Confirm a second account reads zero rows
   from `collection_value_snapshots` while the owner reads theirs, and that
   `/dashboard` on a fresh account shows the tiles and both bar charts with **no**
   "Value over time" card and no gap where it was. That is the whole bug, and it
   needs two real sessions — the standing verification gap in this repo.

Known and accepted: the deprecated `x-cards-key` path answers
`{"snapshots":[]}` (a passcode is not a session, so `auth.uid()` is null and the
policy correctly refuses); a fresh reading can be up to an hour late on the
dashboard (nothing invalidates the cache, the script writes out of band, the
3600s TTL is what buys freshness); and snapshotting is still manual and one
account per run, with nothing scheduling it.

**A public collection stopped publishing the owner's inventory (ADR-0045).**
Found in the code next to the above, not in it. `stripPrices()` nulled
`card.price` and left `card.variants` whole, so `/user/<name>` and
`/api/v1/public/:username/collection` were sending **what the owner paid for
every card, when, in what condition, graded how, their private notes, and how
many they hold** — on the API and inside the profile page's own HTML, since
ADR-0008 added those fields. The page never showed any of it: the public path
reads exactly `rarity` and `owned`. It is `forPublic()` now, an allow-list of
those two, so a new column on `cards` is excluded by default rather than
published by default. `Variant.quantity` became `number | null` as part of it.

Two things to know: **this is a breaking change for any out-of-repo consumer of
the public collection endpoint that read those fields** — the iOS app's source
is not in this repo and could not be checked — and **nobody has loaded
`/user/<name>` and read the RSC payload out of the served HTML since the
change.** `lib/core/cards-public.test.ts` asserts it field by field and also
that none of the values appear anywhere in the serialised payload, but that is
a unit test, not the page.

**There is a privacy policy, at `/privacy` (ADR-0042).** The iOS app cannot be
submitted without one, and App Store Connect asks for a *URL*, so it had to be a
route here first. One policy covers the website and the app — Bart asked whether
it should be two, and the answer is that two documents describing one account
system drift apart, starting with the third-party list.

`app/privacy/page.tsx` is static, sets `robots: { index: true }` explicitly (the
root layout `noindex`s the whole site by design, and this is the third page to
opt out after `/` and `/user/<name>`), and is the first consumer of
`--content-max`. The landing page's inline footer became
`app/components/Footer.tsx` so both pages can carry the link, and
`app/routes.test.ts` now guards it for free.

**A draft written from the iOS side was wrong about this repo in four places**,
which is the part worth remembering: it said "no analytics" while the *website*
runs Vercel Web Analytics, and it credited the website with Sentry, which
`instrumentation.ts` deliberately does not have. Both statements Bart made were
true of different surfaces. The App Store privacy labels still say "no
analytics" correctly, and still need **crash and diagnostic data** adding for
Sentry.

Two facts were looked up rather than assumed and are now written down: the
Supabase project is **eu-west-1** (AWS Ireland), read from
`supabase projects list`; and the controller is **BADU Ventures B.V., KVK
76480801** — the screenshot supplied showed that same number and address under
the name *Strakzat B.V.*, and Bart confirmed twice that both belong to BADU
Ventures.

Not seen in a browser — the standing gap below. It is a static document with no
interactivity, so the exposure is layout only: worth one look at ≤640px, where
the footer collapses to one centred column.

**And there are terms of use, at `/terms` (ADR-0043).** Asked for straight
after: *"dat hoeft dan niet specifiek voor Apple, maar gewoon voor überhaupt
voor onszelf"* — which reframes it, because terms protect the operator where a
privacy policy protects the user. Three sections carry the weight and none came
from a template: **prices are information, not advice** (this app puts a euro
figure beside every card and totals them, which is the shape of thing somebody
treats as a valuation unless told otherwise); **not affiliated with The Pokémon
Company, Nintendo, Game Freak or Creatures** (the other half of the
Pokebinder → Card Orb rename recorded in `lib/core/config.ts`); and **it is
free, so it can change or stop**, against a promise of notice and an export
first.

`app/components/LegalPage.tsx` came out of that — the shell plus a `legal`
object of type class strings, extracted when there were two legal pages rather
than after they had drifted. Each page keeps its own `metadata` export
deliberately: `robots`/`canonical`/`openGraph` differ per route and the shell
would hide the field that must not be wrong.

**One claim was caught before it shipped**, and the shape of it is the lesson: a
draft said "the CSV export is there for that". There is no CSV export — it is
`comingSoon: true` on the landing page, and only *import* is built. A terms page
is written in the register of fact, which turns an unchecked assumption into a
promise.

The landing page's way in to both is the FAQ's fourth entry, "What happens to my
data?" — the footer links there too, but a footer is where a link goes to not be
read, and it filled the empty fourth cell of a two-column grid running with
three.

**Not legal advice**, and it matters more for the terms than the policy: those
are the clauses whose exact wording decides whether they work. Both are honest
about what the software does; the controller block and the legal basis are as
supplied.

**A footer was extracted twice, on the same day, by two workspaces.** This
branch pulled `app/page.tsx`'s inline footer out as `Footer.tsx` so the legal
pages could carry the link; `hamburg` pulled the same markup out as
`MarketingFooter.tsx` so `/app/ios` could. Merging kept **`MarketingFooter.tsx`**
— it arrived first and already had somewhere to put links — and deleted
`Footer.tsx` whole rather than leaving two footers side by side, the same
resolution ADR-0034 records for `displayNameOf()`. `LegalPage.tsx` renders it
now, and the Privacy/Terms links sit beside "iPhone app" in its middle column.
ADR-**0042 is doubled up** (ios-app-page and one-privacy-policy), left that way
per the precedent already set by 0014, 0021, 0023, 0030 and 0034. Third time
this repo has had two workspaces solve the same problem within an hour; worth
noticing as a process fact rather than a merge.
**The iPhone app has a page: `/app/ios` (ADR-0042, workspace `hamburg`).** Asked
for by Bart — a page that says what the app is, what it does, and how to
download it. The awkward part is the last one: the app is not on the App Store,
has no TestFlight build and no date, all confirmed with Bart in the same
exchange. So the download button **ships deliberately inert** —
`aria-disabled="true"` (not `disabled`, so it stays reachable by keyboard and
can explain itself) with a visible note beneath it, and a live "Start on the
web" link next to it. Shipping day is a one-line change to `<Button href
external>`. Screenshots are visible dashed placeholders rather than mock-ups,
to be dropped into `public/app/ios/` later.

Two pure extractions came out of `app/page.tsx` to make a second marketing page
possible without a copy: `app/components/marketingClasses.ts` (the six class
recipes, whose own comment said they stayed local "since every consumer is on
this one page" — this is what ended that) and `app/components/MarketingFooter.tsx`.
`/app` redirects to `/app/ios` **temporarily on purpose**, so it can become the
index of both platforms when Android lands.

**The collection has been audited against TCGdex and 21 rows corrected
(ADR-0040).** Browse made the old `trainer-gallery-row-corrections.md` visible
rather than merely true — a gallery grid showed two grey slots where one owned
card should be — and Bart widened the fix from "those 23 rows" to a principle:
*"Wat we gebruiken als API's, dat is de source of truth."*

So `scripts/audit-collection.mjs` reconciles every row against TCGdex, using
`buildCollection()`'s own matching imported from `lib/core`, and sorts them into
fixable (misspelling; wrong number with exactly one candidate) and not (several
candidates; unplaceable). Dry run by default, undo journal before every write.
Result: 1,917 → **1,938 of 1,968 rows agreeing**, zero left in the auto-fixable
classes. On Silver Tempest its 13 proposals were identical to the hand-compiled
worklist, including which two it refused to decide. The old worklist is deleted;
`docs/collection-audit-corrections.md` is now a build output. **30 rows still
need a person** — 12 are "is this the V or the VMAX", which only the card
answers.

Two traps found by the dry run and worth not re-stepping in:
- **The card-type suffix looked like house style, and was not** — see the
  paragraph below, which reverses this. Worth keeping the shape of the mistake:
  the first run proposed 179 "corrections" that were all suffix, and stripping
  it before comparing was a guess about intent dressed up as a safety measure.
  The right move was to ask, not to decide quietly in either direction.
- **PostgREST caps at 1000 rows silently.** The first run audited 1,000 of 1,968
  and called the rest clean. `lib/storage/postgres.ts` has always had the paging
  loop; `backfill-rarity-types.mjs` did not, and had been backfilling half this
  collection since it was written. Both scripts have it now.

**Both of those exceptions are now closed, against them (ADR-0041).** Bart:
*"Als TCGdex 'Pikachu X' zegt, dan moeten wij dat ook zeggen"* and *"dat maar
ook gewoon doen en tcgdex standaarden volgen"*. So: **293 names** and **956
rarity/type pairs** written, both scripts re-run to zero differences. The suffix
one is less of a reversal than it reads — nothing hand-types a name any more, so
those rows predated the rule rather than upholding a convention.

Two things worth keeping from that: `"Special Illustration Rare"` is **gone**,
folded into `"Ultra Rare"` — knowingly spent, and only recoverable from a
catalogue that draws the distinction, not from the rows. And checking the
consequences turned up a real bug: `"Non-holo"` contains `"holo"`, so
`poke-holo.css`'s substring selector would have foiled the two cards whose
rarity is the word for not having one. Fixed with `:not()` — the first attempt
used an earlier rule of identical specificity, which the later one still beats.
ADR-0012's cascade trap, in miniature. Any change to the rarity vocabulary means
re-checking every rarity-keyed selector.

**You can browse the whole catalogue now, not just what you own (ADR-0037).**
This closes the item further down that was explicitly deferred as "a real,
separate piece of work". Asked for by Bart for the iOS app; scope confirmed by
direct question: API **and** a web screen, signed-in only, with owned + wishlist
+ quantity per card.

- `lib/core/ptcg-browse.ts` — `listSets()`, `findSet(id)`, `setCards(id)`
  against **pokemontcg.io**, cached a DAY, retried three times, and **throwing**
  when exhausted (ADR-0033's rule). Not TCGdex: its list endpoint carries no
  rarity or types (ADR-0030), so a 207-card set would be 207 extra requests.
  One request per set in practice — live-verified, `set.id:sv3pt5` → 207 of 207.
- `lib/core/ownership.ts` — pure, no I/O. Joins raw rows to catalogue cards on
  set name + canonical number, **name-checked with `sameCard()`** because
  ADR-0022's 23 bad gallery numbers are still in the collection. It reads
  `getRows()` (new, in `collection.ts`, reusing the existing `unstable_cache`d
  rows) and deliberately never touches `buildCollection()` — that is the
  per-request walk ADR-0014 exists to prevent.
- `lib/core/set-aliases.ts` — the promo alias table lifted out of `ptcg.ts`,
  now with a reverse index and the gallery-parent rule, so "Silver Tempest
  Trainer Gallery" finds rows filed under "Silver Tempest".
- Endpoints, both behind `authorise()`: `GET /api/v1/catalog/sets` and
  `GET /api/v1/catalog/sets/[setId]` (paged, `page`/`pageSize`, 404 for an
  unknown id, 502 `catalog-unavailable` when the host refused).
  `/api/v1/catalog/search` keeps its shape and gains the same ownership fields.
- Screens: `/collection/browse` and `/collection/browse/[setId]`, a "Browse"
  row in the rail, cross-links with `/collection/sets`, and a `browse/error.tsx`
  of its own so the catalogue's deliberate throw is not blamed on the database.
- Adding from browse reuses the existing dialog: `onAddCard(match)` in
  `CollectionContext`, a `prefill` prop on `CardAddDialog` read in **initial
  state** (AppShell remounts it per opening via `key`) rather than in an effect.

- `lib/core/browse-artwork.ts` (ADR-0038) — the answer to "gebruiken we niet te
  veel data?", which was worth measuring rather than guessing: the API side is
  117 kB per set and negligible, but pokemontcg.io's card scans are 198 kB PNGs
  where TCGdex publishes the **same 245×342 picture as a 26 kB WebP**. So
  `withTcgdexScans()` swaps the URLs card by card after the fact, using the same
  `byNumber` + `sameCard()` rule `buildCollection()` already uses. Measured on
  the real APIs: 151 goes 40.0 MB → 5.3 MB (207/207 matched), Silver Tempest
  Trainer Gallery 5.8 → 0.8, SV Black Star Promos 38.7 → 5.1. It **fails soft**
  — TCGdex silent means heavier pictures, not a broken page. The set index
  deliberately keeps its pokemontcg.io logos; read ADR-0038's option 5 before
  "fixing" that, the maths is the other way round there.

**Two things to watch.** `POKEMONTCG_API_KEY` stays unset and **that is now a
decision, not an omission** (FB-0009, ADR-0039): cost is a hard constraint on
this project, and the earlier advice in ADR-0037/0038 to "set a key" is
withdrawn. It was calibrated to the wrong endpoint. Measured unauthenticated
today: 9 failures in 12 *rapid search-shaped* requests, but only 1 in 6
*whole-set browse-shaped* ones — and browse asks once per set per day behind a
DAY cache, so its real exposure is under 1% per cold set, degrading to a
retryable 502. Search's flakiness is real, pre-existing and unaddressed. Also
recorded there: pokemontcg.io's free V2 tier is announced as going away in
favour of the paid Scrydex, **with no published date**, and the escape route is
TCGdex at the cost of the rarity line (ADR-0030). Do not deepen the
pokemontcg.io dependency without reading ADR-0039. And
none of it has been seen in a signed-in browser (the standing gap below); the
worthwhile manual pass is `/collection/browse` → 151, checked against
`/collection/set/151`, plus one gallery set and one promo set, where the
name/number join is weakest.

**Settings is one page, and the landing page no longer has a demo collection.**
`/settings` was an index of four link rows leading to four sub-routes; it is one
full-width page now, sections stacked, with deleting the account last and on its
own (ADR-0034-settings-one-page, FB-0007). The sub-routes are permanent
redirects in `next.config.ts` — `/settings/password` is the exception and stays
standalone. Immediately after, the landing page's leftover demo framing went
with it (FB-0008, ADR-0036): no "the demo's", no "Public collections" directory
that never existed, and "1,600+ cards tracked" — one person's binder as a
product number — is now "No limit / cards per collection". Both are deployed;
production was checked live for the redirects and the copy. **Neither has been
seen signed in**, same standing gap as everything below.

**New accounts now have a first run (ADR-0035).** `/welcome` is a four-step wizard —
username and display name, avatar, sharing, and how to fill the collection —
shown once, with every step skippable and skipping writing nothing.
It is gated on a new nullable `profiles.onboarded_at`
(`supabase/migrations/20260816090000_profile_onboarded.sql`, which backfills
existing accounts as already onboarded, so it ships invisible to the live one).
`app/(app)/layout.tsx` redirects an account with a null there to `/welcome`,
before the collection fetch; `/welcome` itself sits outside the `(app)` group
so it does not redirect to itself or inherit the signed-in chrome.

Two things came with it. `getCollection()` in `lib/core/collection.ts` now
reports whether the fetch gave up, so an empty collection and an unreachable one
stop being the same value: a new account reads "No cards yet" with a button that
opens the add dialog, and the old "not available right now" is kept for real
outages. And the avatar upload is one component now (`AvatarPicker.tsx` +
`useAvatarUpload.ts`), shared by Settings > Profile and the wizard.

**Not browser-verified.** Same standing gap as signup and avatar upload: no
agent session here can hold a signed-in session, so the flow has been
typechecked, tested at the route (`app/api/v1/profile/route.test.ts` covers the
one-way `onboarded` stamp) and built, but never clicked. Manual pass: set
`onboarded_at` to null for an account, load `/dashboard`, and walk all four
steps plus Skip on each. The migration **has** been applied to production
(`supabase db push`). Settings > Profile gained the same live username check the
flow uses, in one shared hook (`useUsernameCheck.ts`) — the database is still
the guarantee (unique `citext` plus the atomic `claim_username` RPC).

**Every collection is now named after its own owner (ADR-0034).** The app had
been multi-user for a while — accounts, `profiles`, per-user rows, RLS — while a
single env var, `OWNER_NAME`, still titled every public page "Bart's Pokémon card
collection". Production had a live instance of this: `/user/pikachu` served that
account's collection under Bart's name, in the title, the OG image and the
JSON-LD. `OWNER_NAME` and `PUBLIC_USERNAME` are deleted; the name comes from the
profile being rendered (`ownerOf()` now returns the whole profile, and
`lib/core/owner.ts` decides what to call it, falling back to the username).
Signup asks for a name, optionally, and no longer seeds `display_name` with the
generated username. Two single-owner leftovers went with it: the public
card-detail route 404'd every account but the first, and the sitemap listed one
hardcoded profile.

Merged (#49) and deployed. One 500 followed it straight to production and is
fixed (#52, ADR-0035): the OG image had always been misconfigured —
`revalidate = 3600` on a route that reads cookies — and the page's
`generateStaticParams`, returning one hardcoded username, had been hiding it.
Worth remembering how it was found: `npm run check` and `npm run build` were
green, and a local production build served the image at 200. Only fetching the
deployed URL caught it, and `vercel logs` diagnosed it in one step. **GitHub
Actions is not running** — every workflow fails with "recent account payments
have failed or your spending limit needs to be increased", so `check.yml` is
not a gate right now and its steps have to be run locally before a merge.

**Open, and needed before this is fully live:** the backfill migration
`supabase/migrations/20260816120000_display_name_is_a_person_not_a_username.sql`
has **not** been applied. It nulls `display_name` where it is a copy of the
username — safe and narrow (only exact, case-insensitive matches), but it is the
production database, so it is Bart's to run. Nothing breaks without it; accounts
just keep showing a generated handle as though it were a chosen name.

Still unverified in a browser, and the same gap as before: the Settings "Your
name" panel and the landing header's "Signed in as …" both need a real signed-in
session, and the Chrome extension was not connected this session. Everything
reachable without signing in was checked live against production data — both
public pages' titles and headings, both OG images, the sitemap, and the
card-detail route for both accounts.

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

Since then, in this session: `.env.local` gained real
`NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`/
`SUPABASE_SERVICE_ROLE_KEY` (filled in outside the chat, as instructed
above), so this workspace now has a working connection to the live "Card
Orb" Supabase project (`fprjroupecdhosfdrqhv`) for the first time. On
Bart's explicit go-ahead, both outstanding migrations were applied with
`supabase link --project-ref fprjroupecdhosfdrqhv` then `supabase db
push`: `20260815120000_drop_notion_connections.sql` (already applied
earlier, confirmed) and `20260815130000_profile_avatar.sql` (applied this
pass). `supabase migration list` confirms all six local migrations now
match remote.

Since then, in this session: a card opened from `/collection` now stays
inside the `(app)` shell as a real page instead of falling through to the
older, separate `/cards/[id]` page outside it (`docs/decisions/0029-collection-card-detail-stays-in-shell.md`).
New route `app/(app)/collection/card/[id]/page.tsx`, near-identical to
`/cards/[id]/page.tsx` (same `CardDetail`, same data-fetching), reached via
a new optional `basePath` prop threaded through `CardNav.tsx` →
`CardItem.tsx`/`CardLink` → `CardsView.tsx` → `CollectionScreen.tsx` (the
one caller that sets it to `/collection/card`; every other caller keeps
the `/cards` default, so `/cards/[id]` and its intercepted modal are
unchanged for old bookmarks/links). No dialog for this route at any
width — a plain page every time, per the explicit ask. `npm run check`
green; not exercised signed-in with real data via a live browser in this
workspace.

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

- **Seed the value snapshots, then delete
  `lib/core/collection-value.generated.json`.** The three steps are spelled out
  under "Now" (ADR-0044). Nothing has been written to
  `collection_value_snapshots` yet, so *every* dashboard currently draws no
  chart — including the owner's. This is the one item that leaves a shipped
  feature blank until it is done.
- **`/dashboard` has not been seen with the new value figure.** Collection value
  now multiplies by copies held, so the number moves up by whatever the
  duplicates are worth. Worth one look that it still fits its tile — it is
  rendered with proportional figures at `--fs-h2`, and a five-digit euro amount
  was already the widest thing in that row.
- **Check a real `/user/<name>` payload after the ADR-0045 change.** Load the
  page, read the RSC payload out of the served HTML, and confirm no purchase
  price, note, condition or quantity is in it. Then the same on
  `curl $SITE/api/v1/public/<name>/collection`. Unit-tested, not seen.
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
