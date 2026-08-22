# Conventions

last-reviewed: 2026-08-22

The rules this codebase runs on. Present tense, imperative, testable.

**Enforcement** is one of three, and the difference matters:

- **Enforced** — a check fails. You cannot break it by accident. The command is named.
- **Reviewed** — a person has to notice. Say it in review.
- **Intent** — nothing checks it. It is here because forgetting it has cost time.
  Anything on this list is a candidate to make enforceable or to drop.

IDs are stable. Say "ignore R-STYLE-006 here" rather than quoting the rule.

Distilled from 108 decision records and 25 feedback records, removed on
2026-08-22. The rules survived; the reasoning is in `git log`.

---

## Structure

| ID | Rule | Enforcement |
|---|---|---|
| **R-STRUCT-001** | A feature does not import another feature. Cross-links go in the route that needs both, or into `lib/`. | Enforced — `eslint.config.mjs`, `npm run lint` |
| **R-STRUCT-002** | A feature does not import a route. Routes compose features, never the reverse. | Enforced — `eslint.config.mjs` |
| **R-STRUCT-003** | `components/shared/` does not name a feature. Shared code that knows a domain belongs to that domain. | Enforced — `eslint.config.mjs` |
| **R-STRUCT-004** | A component used by exactly one route lives in that route's `_components/`. | Reviewed |
| **R-STRUCT-005** | `app/` is routing and data fetching. Logic lives in a feature or in `lib/`. | Reviewed |

```
src/app/<route>/              routing + data fetching
src/app/<route>/_components/  UI only that route uses
src/features/<domain>/        UI and hooks owned by one domain
src/components/shared/        UI with no domain (Button, Modal, FormField)
src/components/base|application|foundations|shared-assets/
                              vendored Untitled UI — CLI-managed
src/lib/                      db, auth, clients, domain logic
src/hooks/ utils/ providers/ styles/
```

`types/` does not exist: types live beside what defines them. `features/*` has no
`actions.ts` / `queries.ts` / `schemas.ts` — data access is in `lib/`.

## Styling

| ID | Rule | Enforcement |
|---|---|---|
| **R-STYLE-001** | `src/styles/theme.css` is the only place a design value is written. | Enforced — `node scripts/extract-theme-values.mjs --check`, plus `src/lib/design/stylesheet-discipline.test.ts` for colours in the other stylesheets |
| **R-STYLE-002** | No font size and no letter-spacing in a className — not `[font-size:…]`, not `text-[13px]`, not `tracking-[-0.02em]`. Snap to a step or name it in `theme.css`. | Enforced — `src/lib/design/type-discipline.test.ts` |
| **R-STYLE-003** | A heading's weight is `font-title` (500) or `font-title-strong` (600), never `font-medium` or `font-semibold`. | Reviewed |
| **R-STYLE-004** | Headings come in two registers (below). A section heading is always smaller than the page title above it. | Reviewed |
| **R-STYLE-005** | Only a token inside `@theme` becomes a utility. A token in `:root` alone generates nothing and fails silently. | Intent |
| **R-STYLE-006** | Untitled UI is the default. A local value must earn the exception with the identity or a measurement. Where even, take theirs. | Reviewed |
| **R-STYLE-007** | The product identity is two things: the holographic shine and the card tilt. Nothing else is protected. | Reviewed |
| **R-STYLE-008** | No `@apply`, no `@layer components`. A shared utility string lives in one constant or one component. | Reviewed |
| **R-STYLE-009** | Do not name a token what Tailwind names one, unless replacing Tailwind's app-wide on purpose. | Intent |
| **R-STYLE-010** | Never give a conditionally-reset property to Tailwind unconditionally. The property stays in CSS, or the override becomes a matching variant. | Intent |
| **R-STYLE-011** | Grep the whole tree for a class name before deleting its CSS. Loading states and second render branches are the traps. | Intent |
| **R-STYLE-012** | A literal class name is defined in CSS, read by a variant, or deleted. | Intent |
| **R-STYLE-013** | Controls have two shapes: `shape-round` (default) and `shape-rectangle`. Shape is a cascading property on a container, never a prop. | Reviewed |
| **R-STYLE-014** | A button is the component. `untitledButtonClasses.ts` is only for elements a React Aria `Button` cannot be. A transparent interactive *row* — a facet, a sidebar entry — is the exception this allows: a bare `<button type="button">` is right there, and a React Aria `Button` would add nothing it does not already have. | Reviewed |
| **R-STYLE-015** | One icon set: `@untitledui-pro/icons`. | Enforced — `scripts/untitled-add.mjs` rewrites imports and drops the second package |
| **R-STYLE-016** | A colour cleared as a graphic (3:1) is not cleared under a word (4.5:1). Every text-on-surface pair, every control boundary and both placeholders are measured. | Enforced — `src/lib/design/contrast.test.ts` |
| **R-STYLE-017** | The page is `bg-secondary`; raised surfaces are `bg-primary`. | Reviewed |
| **R-STYLE-018** | `styles/poke-holo.css` is unlayered, so every rule in it beats every Tailwind utility. Know that before adding to it. Its colours are `--color-foil-*` in `theme.css` like everything else. | Intent for the layering; Enforced for the colours — `src/lib/design/stylesheet-discipline.test.ts` |

**The two heading registers (R-STYLE-004):**

| | Public — marketing, legal, `/brand` | App — signed-in and the four door screens |
|---|---|---|
| Page title | `text-display-md` 36px | `text-display-xs` 24px |
| Section | `text-display-sm` 30px | `text-xl` 20px |
| Card / sub | `text-lg` 18px | `text-md` 16px |

Three sizes sit outside the table because it cannot hold them, and each is a
token rather than a number in a className: `text-hero` / `text-hero-narrow`
(the two marketing heroes — a clamp the stepped scale cannot express),
`text-wordmark`, and `text-micro` (9px, a count inside a 20px icon). A fourth
caller for any of them means it is a scale step and belongs in the table.

## Components — Untitled UI

| ID | Rule | Enforcement |
|---|---|---|
| **R-UI-001** | Untitled UI is the component library. Before building any UI component, search it: `npx untitledui@latest search "<description>"`. | Reviewed |
| **R-UI-002** | It exists: use it. Our need differs: a thin wrapper in `components/shared/`, never a new implementation. | Reviewed |
| **R-UI-003** | Never edit `base/`, `application/`, `foundations/` or `shared-assets/` by hand. They are vendor code and the CLI rewrites them wholesale. | Reviewed |
| **R-UI-004** | Build something of our own anyway: say in one sentence what you searched for and why it was not there. | Reviewed |
| **R-UI-005** | Add components with `npm run ui:add`, never `npx untitledui add` alone. The wrapper repairs six things the generator breaks and reports what it touched. Read that report. | Reviewed |
| **R-UI-006** | Vendored trees are exempt from this project's lint and formatting — not from `strict`. The exemption is about style, not about a component that cannot render. | Enforced — `tsconfig.vendored.json` |
| **R-UI-007** | A vendored component with no consumer is not known to work. | Intent |
| **R-UI-008** | `src/utils/` and `src/hooks/` are mixed: vendored beside first-party, exemptions **per file** across `eslint.config.mjs`, `.prettierignore` and both tsconfigs. A new vendored file there goes in all four. | Reviewed |

## Cards and catalogues

| ID | Rule | Enforcement |
|---|---|---|
| **R-DATA-001** | The catalogues say what a card *is*; the collection says that you *own* it. Never the other way round. | Reviewed |
| **R-DATA-002** | Rarity, type and era come from the catalogue and are read-only in the UI. | Reviewed |
| **R-DATA-003** | Nothing writes a collection row the catalogue has not matched. | Reviewed |
| **R-DATA-004** | A copy records which printing it is. `null` is "nobody has said", not `normal`. | Reviewed |
| **R-DATA-005** | TCGdex's vocabulary, without exceptions — including the card-type suffix and the coarser rarity tiers. | Reviewed |
| **R-DATA-006** | Collection value is per user and counts copies held. | Reviewed |

## API and platform

| ID | Rule | Enforcement |
|---|---|---|
| **R-API-001** | The three routes under `/api/v1/public/<username>/` are open on purpose, carry no prices, and each has its own rate limiter. Everything else under `/api/v1/` requires a viewer. | Reviewed |
| **R-API-002** | A public collection exposes exactly two variant fields: `rarity` and `owned`. It is an allow-list, so a new column is excluded by default. | Enforced — `src/lib/core/cards-public.test.ts` |
| **R-API-003** | No paid third-party services. Recurring cost is a hard constraint. | Reviewed |
| **R-API-004** | A route that reads a JSON body bounds it with `readJsonBody()` and a named `BODY_LIMIT`. Nothing else does: Next sets no limit and neither does `next.config.ts`. | Enforced — `src/lib/api/body.test.ts` |
| **R-API-005** | Two validation idioms, and the boundary decides which. `zod` at process boundaries that run once and must fail loudly — today that is `lib/core/env.ts` and nothing else. Hand-written narrowing (`typeof`, `Array.isArray`) for request bodies, after `readJsonBody()` has bounded them. Do not reach for a schema for three fields. | Reviewed |
| **R-PLAT-001** | Cloudflare stays DNS-only, never proxied. Proxying breaks `x-forwarded-host`, which `sameOrigin()` depends on. | Intent |
| **R-PLAT-002** | `NEXT_PUBLIC_SITE_URL` is set in Vercel's **Build** environment. `NEXT_PUBLIC_` is inlined at build time, so runtime-only silently does nothing. | Intent |
| **R-PLAT-003** | Every screen renders exactly one `<main id="main-content">`, after its own navigation. The root layout does not. | Enforced — `src/app/main-landmark.test.ts` |
| **R-PLAT-004** | The `(app)` loading fallback may only draw what is true on all seven routes it covers. | Reviewed |

---

## Open

Not rules — things a rule cannot yet be written for.

- **`lib/core` is not split by domain.** Fine at two features; ambiguous at three.
- **Eight rules are Intent.** By this project's own standard those are not rules.
  Each is a candidate to make enforceable or to drop. R-STYLE-018 was the ninth
  and is now half enforced, which is the shape the rest of the list should take:
  find the half of the rule a machine can hold, and hold it.
