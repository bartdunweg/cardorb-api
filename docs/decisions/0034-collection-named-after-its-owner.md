---
id: ADR-0034
title: A collection is named after its owner's profile, not after an env var
status: accepted
date: 2026-08-16
scope: repo
deciders: [Bart]
superseded-by: null
tags: [accounts, profile, signup, seo, multi-user]
---

# A collection is named after its owner's profile, not after an env var

## Context and problem statement

Card Orb became multi-user some time ago: accounts, a `profiles` table, per-user
`cards` rows, row level security, `ownerOf()` resolving `/user/<name>` to a real
user id. The *name* on a collection never made that move. `OWNER_NAME` — an env
var in `lib/core/config.ts` defaulting to the literal string `"Bart"`, written
with a note saying it "becomes a lookup on the same day PUBLIC_USERNAME does" —
was still read by nine render sites:

- `/user/<name>`'s `<title>`, `og:title`, `twitter:title` and `CollectionPage`
  JSON-LD `name`
- the OG image's `alt` and its drawn heading
- `CardsView`/`CardsSidebar`'s rail heading ("Bart's collection")
- `app/layout.tsx`'s site-wide `authors`
- the landing page's `WebApplication` JSON-LD `author`, and — worst of the set —
  the landing header's literal `Signed in as {OWNER_NAME}`, shown to whoever was
  actually signed in

This was not hypothetical. Production has two public profiles; `/user/pikachu`
was serving that account's own (empty) collection under the title "Bart's Pokémon
card collection", with a matching OG image.

Two more single-owner leftovers sat in the same family:
`app/api/v1/public/[username]/cards/[tcgId]/route.ts` gated on
`username !== PUBLIC_USERNAME` and so 404'd every other account's card detail,
while its two sibling routes had already moved to `ownerOf()`; and `sitemap.ts`
listed exactly one hardcoded profile URL.

The column to carry this already existed — `profiles.display_name`, nullable,
`≤ 60` chars — and two things stopped it working. Nothing on the public page read
it (`ownerOf()` threw away everything but the id, though `publicProfile()` already
selected `id, username, display_name`), and `app/api/v1/signup/route.ts` seeded it
with the generated username (`display_name: username`), so every account's "name"
was literally `swift-eevee-4821` and no code could tell a name somebody chose from
one nobody did.

## Considered options

**Where the name comes from**

1. **Keep `OWNER_NAME` as a per-deployment default and only override it when a
   profile has a display name** — rejected. It keeps a person's name in
   deployment configuration, and the fallback is somebody else's name, which is
   the exact failure being fixed. A wrong name is worse than a plain one.
2. **Read `display_name` from the profile, fall back to the username** — chosen.
3. **Read `display_name`, fall back to a generic "A Pokémon card collection"** —
   rejected. Every unnamed page would be titled identically, which is worse for
   both the reader and search; the username is at least theirs, and it is the
   same string Settings already shows as its placeholder.

**Where a name is asked for**

4. **Settings only; signup stays email + password** — rejected as the sole
   answer. It leaves ADR-0006's stated downside untouched: somebody has to know
   to go and find the field.
5. **Required field at signup** — rejected. It puts back exactly the friction the
   username field was removed for.
6. **Optional field at signup, editable in Settings** — chosen. Filling it in
   takes a second and gives a correctly-titled public page without ever opening
   Settings; skipping it costs nothing and lands as `null`.

**One name field or first + last**

7. **First name and last name as separate columns/fields** — rejected. The split
   exists to serve billing and shipping, and this app has neither. It also asks
   mononymous people, people with multiple family names, and anyone whose name
   does not sort into two boxes to misrepresent themselves for no downstream
   benefit — nothing here ever needs the halves apart.
8. **One free-text name, which `display_name` already is** — chosen. It is what
   GitHub, Instagram and X do, and it needs no schema change.

## Decision

`lib/core/owner.ts` is the single place that decides what to call somebody:
`ownerLabel()` (trimmed `displayName` or else `username`), `possessive()` and
`collectionTitle()`. No React, no database, no `server-only` — a page, a route,
an image and a test all reach it.

`ownerOf()` returns the whole `PublicProfile` rather than just the id, and is
wrapped in React's `cache()` so `generateMetadata` and the page body share one
lookup. Every render site above now reads the profile: the public page's title
and JSON-LD, the OG image's drawn heading (with a font-size step so a 60-character
name wraps rather than running off the canvas), and `CardsView`/`CardsSidebar` via
a new `ownerName` prop.

Signup accepts an optional `name`, capped at `MAX_DISPLAY_NAME` (60, matching the
column's check constraint), and passes it as `display_name` — omitted entirely
when empty. The trigger's existing `nullif(... ->> 'display_name', '')` turns both
cases into `null`, so no trigger change was needed. `display_name: username` is
gone. A migration nulls the copies already written, matched case-insensitively and
only where the two columns are literally the same string.

Settings' panel is retitled "Your name", and its hint now previews the resulting
title live, so the form and the public page visibly agree.

`OWNER_NAME` and `PUBLIC_USERNAME` are deleted, along with `generateStaticParams`
on a `force-dynamic` route (it pre-rendered one hardcoded username and did
nothing). `sitemap.ts` becomes the query its own comment promised — every
`is_public` profile — which makes the route dynamic on purpose: the list changes
when somebody flips their privacy switch. The card-detail route's
`PUBLIC_USERNAME` gate becomes the same `ownerOf()` lookup its siblings use.

Two related things were left alone deliberately, and one dead branch was removed:
site-wide `authors` in `app/layout.tsx` is dropped rather than re-pointed (whose a
collection is belongs on that collection's route), the landing JSON-LD's
`author: Person` becomes `publisher: Organization` (the landing describes the
product), and `CardsProfile`'s signed-out branch — provably unreachable, since
`CardsView` renders it only when `!isPublic` and derives `signedIn` from the same
expression — was deleted along with the last copy in the app that named the owner
out loud.

Always `’s`, including after a trailing *s* ("Lucas’s"). The apostrophe-only form
is a contested style rule, and no code can tell a surname ending in *s* from a
plural; one consistent rule is the smaller wrong answer. A typographic apostrophe,
matching the `&rsquo;` the OG image already drew.

## Consequences

- Good, because the bug is gone at the source: there is no longer any code path
  that can render one person's name over another person's collection, since the
  constant that made it possible does not exist.
- Good, because `/api/v1/public/<name>/cards/<id>` now answers for every public
  account instead of only the deployment's owner — verified live: `pikachu` went
  from 404 to 200.
- Good, because the sitemap lists every public collection rather than one, and
  keeps up when somebody makes theirs public.
- Bad, because `/sitemap.xml` is now a dynamic route with a database query behind
  it. Mitigated: it selects one column, is capped at 50,000 rows, and fails soft
  to just `/` rather than 500ing.
- Bad, because the public page's meta description lost its card count ("Over
  sixteen hundred Pokémon cards"). That number was a fact about one binder printed
  on everybody's page, and counting per owner inside `generateMetadata` would cost
  a second walk of the collection — the exact cost the constant existed to avoid.
  The real count is still drawn in the OG image.
- Bad, because `ownerOf()`'s return type changed from `string | null` to
  `PublicProfile | null`. Four callers and two test files were updated; the type
  system catches any that were missed.
- Neutral, because the OG image's `alt` had to become generic ("A Pokémon card
  collection"). `alt` is a module-level export, so Next reads it once and it
  cannot see which profile is being drawn — but it named the deployment's owner
  before, which was wrong for everybody else rather than merely vague.
- Neutral, because existing accounts lose a display name they never chose. The
  rendered string is identical either way (the fallback is the username), and
  Settings now shows the placeholder that says the field is empty.

## Confirmation

`npm run check` green — typecheck, 347 tests across 30 files including a new
`lib/core/owner.test.ts`, lint at `--max-warnings 0`. `npm run build` green.

Verified live against the running app (read-only, production data):

- `/user/bartdunweg` → "Bart’s Pokémon card collection" in `<title>` and JSON-LD;
  `/user/pikachu` → "Pikachu’s Pokémon card collection". Rail headings likewise.
- Both OG images render the right name and the right card count.
- `/sitemap.xml` lists both public profiles.
- `/api/v1/public/{bartdunweg,pikachu}/cards/sv03-125` → 200, 200; an unknown
  name → 404.
- The signup form serves "Your name" first, `autocomplete="name"`,
  `maxlength=60`, `aria-describedby` wired to its hint, not required; the route
  rejects a 61-character name with a plain sentence before touching the database.

**Not verified**, and honestly so: the Settings panel and the landing header's
"Signed in as …" both need a real signed-in session, and no browser session was
available (the Chrome extension was not connected). STATE.md already carried
signup and profile as unverified-in-browser; that gap is unchanged. The backfill
migration has **not** been applied — it is a production database and applying it
is Bart's call.

## Related

- Feedback: FB-0007
- Extends: ADR-0006 (generated username at signup). Not superseded — the username
  is still generated, and this closes the "the person has to know to go find it in
  Settings" downside that record named explicitly.
- Touches: ADR-0023, which removed the landing's `/user/{PUBLIC_USERNAME}` links
  and noted `PUBLIC_USERNAME` was kept for `generateStaticParams`; that last
  reason is now gone too.
- Code: `lib/core/owner.ts`, `lib/core/collection.ts`, `lib/core/config.ts`,
  `lib/core/account.ts`, `lib/api/viewer.ts`, `lib/storage/postgres.ts`,
  `app/user/[username]/{page.tsx,opengraph-image.tsx}`, `app/sitemap.ts`,
  `app/page.tsx`, `app/layout.tsx`, `app/components/{SignUpForm,ProfileSettings,
  CardsView,CardsSidebar,CardsProfile}.tsx`, `app/api/v1/{signup,profile}/route.ts`,
  `app/api/v1/public/[username]/cards/[tcgId]/route.ts`,
  `supabase/migrations/20260816120000_display_name_is_a_person_not_a_username.sql`
