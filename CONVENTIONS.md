# Conventions

The rules this codebase runs on, in the present tense. Each says how it is held:

- **Enforced** — a check fails. You cannot break it by accident.
- **Reviewed** — a person has to notice. Say it in review.
- **Intent** — nothing checks it. It is here because forgetting it has cost time.

Distilled from 108 decision records and 25 feedback records before those were
removed. The reasoning behind any rule is in `git log`; what survives here is
the rule itself.

---

## Structure

**1.** A feature does not import another feature. Cross-links go in the route
that needs both, or into `lib/`. — *Enforced* (`eslint.config.mjs`)

**2.** A feature does not import a route. Routes compose features, never the
reverse. — *Enforced*

**3.** `components/shared/` does not know about a feature. Shared code that
names a domain belongs to that domain. — *Enforced*

**4.** A component used by exactly one route lives in that route's
`_components/`. — *Reviewed*

**5.** `app/` is routing and data fetching. Business logic lives in a feature or
in `lib/`. — *Reviewed*

Where things go:

```
src/app/<route>/            routing + data fetching
src/app/<route>/_components/  UI only that route uses
src/features/<domain>/      UI and hooks owned by one domain
src/components/shared/      UI with no domain (Button, Modal, FormField)
src/components/base|application|foundations|shared-assets/
                            vendored Untitled UI — CLI-managed, do not restructure
src/lib/                    db, auth, clients, domain logic
src/hooks/ utils/ providers/ styles/
```

`types/` does not exist: types live beside what defines them. `features/*` has
no `actions.ts`/`queries.ts`/`schemas.ts` — data access is in `lib/`.

---

## Styling

**6.** `src/styles/theme.css` is the only place a design value is written. —
*Enforced* (`scripts/verify.sh` regenerates and fails on a diff)

**6b.** A heading's weight comes from `--font-weight-title` (500) or
`--font-weight-title-strong` (600), written as `font-title` / `font-title-strong`
— never `font-medium` or `font-semibold`. Those are Tailwind's defaults, which
puts them outside `theme.css` by definition. — *Reviewed*

**7.** Only a token inside `@theme` becomes a Tailwind utility. A token in
`:root` alone generates nothing and fails silently. — *Intent*

**8.** Untitled UI is the default. A local value must earn the exception with
the product identity or a measurement. Where the two are even, take Untitled
UI's and note it. — *Reviewed*

**9.** The product identity is exactly two things: the holographic shine
(`styles/poke-holo.css`) and the card hover/tilt. Nothing else is protected. —
*Reviewed*

**10.** No `@apply`, no `@layer components`. A shared utility string lives in
one constant or one component. — *Reviewed*

**11.** Do not name a token what Tailwind names one, unless you are replacing
Tailwind's for the whole app, vendored code included. — *Intent*

**12.** Never give a conditionally-reset property to Tailwind unconditionally.
Either the property stays in CSS, or the override becomes a matching variant.
This has been got wrong six times. — *Intent*

**13.** Grep the whole tree for a class name before deleting its CSS. Loading
states and second render branches are the standing traps. — *Intent*

**14.** A literal class name must be defined in CSS, read by a variant, or
deleted. — *Intent*

**15.** Controls have two shapes: `shape-round` (capsule, the default) and
`shape-rectangle` (8px). Shape is a cascading custom property on a container,
not a prop. Do not add a `shape` prop to anything new. — *Reviewed*

**16.** A button is the component, not a copy of its classes.
`untitledButtonClasses.ts` is only for elements a React Aria `Button` cannot be.
— *Reviewed*

**17.** One icon set: `@untitledui-pro/icons`. An identical name is not an
identical icon. — *Enforced* (`scripts/untitled-add.mjs` rewrites imports and
drops the second package)

**18.** A colour cleared as a graphic (3:1) is not cleared for use under a word
(4.5:1). — *Enforced* (`src/lib/design/contrast.test.ts` resolves every text and
surface token out of `theme.css` and measures it)

**19.** The page is `bg-secondary`; raised surfaces are `bg-primary`. One canvas
for the whole app. — *Reviewed*

**20.** `styles/poke-holo.css` is unlayered, so every rule in it beats every
Tailwind utility. Know that before adding to it. — *Intent*

---

## Vendored Untitled UI

**21.** `components/base|application|foundations|shared-assets`, plus
`utils/cx.ts`, `utils/is-react-component.ts` and Untitled UI's hooks in
`hooks/`, are exempt from this project's lint and formatting — **not** from
`strict`. The exemption is about style, not about a component that cannot
render. — *Enforced* (`tsconfig.vendored.json`, per-file exemptions elsewhere)

**22.** Add components with `npm run ui:add`, never `npx untitledui add` alone.
The wrapper repairs six things the generator breaks every time and reports what
it touched. Read that report. — *Reviewed*

**23.** A vendored component with no consumer is not known to work. — *Intent*

**24.** `src/utils/` and `src/hooks/` are mixed: vendored files sit beside
first-party ones and the exemptions are **per file**, across
`eslint.config.mjs`, `.prettierignore` and both tsconfigs. A new vendored file
there has to be added to all four. — *Reviewed*

---

## Cards and catalogues

**25.** The catalogues say what a card *is*; the collection says that you *own*
it. Never the other way round. — *Reviewed*

**26.** Rarity, type and era come from the catalogue and are read-only in the
UI. They are facts about the card, not judgements about the copy. — *Reviewed*

**27.** Nothing writes a collection row the catalogue has not matched. A card
pokemontcg.io has not indexed cannot be added — a known, accepted tradeoff. —
*Reviewed*

**28.** A copy records which printing it is. `null` means "nobody has said" and
is not the same as `normal`. — *Reviewed*

**29.** TCGdex's vocabulary, without exceptions — including the card-type
suffix and the coarser rarity tiers. — *Reviewed*

**30.** Collection value is per user and counts copies held. — *Reviewed*

---

## API and platform

**31.** The three routes under `/api/v1/public/<username>/` are open on purpose,
carry no prices, and each has its own rate limiter. Everything else under
`/api/v1/` requires a viewer. Do not "fix" the guard back off
`/api/v1/collection`. — *Reviewed*

**32.** A public collection exposes exactly two variant fields: `rarity` and
`owned`. It is an allow-list, so a new column is excluded by default. —
*Reviewed*

**33.** No paid third-party services. Recurring cost is a hard constraint;
check a key is free before reaching for it. — *Reviewed*

**34.** Cloudflare stays DNS-only, never proxied. Proxying breaks
`x-forwarded-host`, which `sameOrigin()` in `lib/api/guard.ts` depends on. —
*Intent*

**35.** `NEXT_PUBLIC_SITE_URL` must be set in Vercel's **Build** environment.
The `NEXT_PUBLIC_` prefix means Next inlines it at build time, so setting it
only at runtime silently does nothing. — *Intent*

**36.** Every screen renders exactly one `<main id="main-content">`, after its
own navigation. The root layout does not. — *Enforced*
(`src/app/main-landmark.test.ts`)

**37.** The `(app)` loading fallback may only draw what is true on all seven
routes it covers. Anything route-specific goes in that route's own
`loading.tsx` or nowhere. — *Reviewed*

---

## Open

Things a rule cannot yet be written for, kept here rather than lost:

- **Three colour pairs sit below the threshold that applies to them.** All
  three are Untitled UI's values, so rule 8 says take them; these are the
  measurement that would earn the exception, and the decision is not made.
  They are pinned in `contrast.test.ts` at today's figure, so a change fails:
  placeholder text in dark mode is **4.18** against 4.5, and a control's border
  is **1.48** (light) and **1.91** (dark) against the 3:1 that WCAG 1.4.11 asks
  of a component's boundary.
- **Page titles have no norm.** Weight is a token now, and every heading in the
  app reads it — but four *sizes* still claim to be "the page title":
  `display-md` (marketing, legal, brand), `display-sm` (route error),
  `display-xs` (the seven signed-in screens and the four door screens). Two of
  those are defensible as two registers; four are not. **Undecided.**
- **One heading is still `font-bold`** — `RouteError.tsx:53`, the only one in
  the app. Left alone because changing it changes what paints, and it is a
  taste call rather than a definition one.
- **`lib/core` is not split by domain.** Fine at two features; ambiguous at
  three.
- **15 of 28 API routes have no named validation**, and nothing uses zod except
  the env check.
- **`@react-types/shared` is imported but not declared** in `package.json`.
