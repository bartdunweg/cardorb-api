# Conventions

The rules that apply **now**, in this repository. This is the only binding source, and it is
the whole memory — there is no archive of decisions and no archive of feedback.

A rule is rewritten or deleted the moment it stops being true. What it used to say is in
`git log -p CONVENTIONS.md`, which is deliberately not in the read path. A request from the
owner outranks any rule here; say which one it departs from, then do it.

- `Enforcement` is `reviewed`, or `enforced — <what enforces it>`. There is no third value:
  a rule nothing checks is dropped or made checkable.
- `Why` is one sentence and may not be empty. Where the reason is genuinely lost, write
  `unknown` — never invent one.
- IDs are stable and never reused, so a rule can be waived by name in a conversation.
- Present tense, imperative, at most two lines. No dates — that is what git is for.
- There is no rule-count ceiling. Freshness is the brake, not size.

last-reviewed: 2026-08-22

---

## Structure

| ID | Rule | Enforcement | Why |
|---|---|---|---|
| R-STRUCT-001 | A feature does not import another feature. Cross-links go in the route that needs both, or into `lib/`. | enforced — `eslint.config.mjs`, `npm run lint` | Two features that reach into each other cannot be deleted, moved or read separately. |
| R-STRUCT-002 | A feature does not import a route. Routes compose features, never the reverse. | enforced — `eslint.config.mjs` | A feature that reaches back into a route only works on that route, which is not what a feature is. |
| R-STRUCT-003 | `components/shared/` does not name a feature. Shared code that knows a domain belongs to that domain. | enforced — `eslint.config.mjs` | A shared component that knows a domain is a domain component filed where nobody looks for it. |
| R-STRUCT-004 | A component used by exactly one route lives in that route's `_components/`. | reviewed | A one-caller component parked in a shared folder invites a second caller that should never have existed. |
| R-STRUCT-005 | `app/` is routing and data fetching. Logic lives in a feature or in `lib/`. | reviewed | Logic inside a route cannot be tested or reused without the route around it. |
| R-STRUCT-006 | `lib/core/` is `catalogue/`, `collection/` and `account/`. Only what both domains need — config, env, format, og, slug, util — stays at its root. | reviewed | Thirty files on one heap gave no hint which of them a change could reach, and the three names are the ones the rules already use. |
| R-STRUCT-007 | A decision inside a client component — a filter, a sort, a derived label — lives in a plain module beside it. The component keeps the state; the module says what it means. | reviewed | A decision reachable only by rendering the page is a decision nothing tests, which is how `src/features/` reached 30 files and zero tests. |

```
src/app/<route>/              routing + data fetching
src/app/<route>/_components/  UI only that route uses
src/features/<domain>/        UI and hooks owned by one domain
src/components/shared/        UI with no domain (Button, Modal, FormField)
src/components/base|application|foundations|shared-assets/
                              vendored Untitled UI — CLI-managed
src/lib/core/<domain>/        domain logic, under the domain it belongs to
src/lib/                      db, auth, clients
src/hooks/ utils/ providers/ styles/
```

`types/` does not exist: types live beside what defines them. `features/*` has no
`actions.ts` / `queries.ts` / `schemas.ts` — data access is in `lib/`.

## Styling

| ID | Rule | Enforcement | Why |
|---|---|---|---|
| R-STYLE-001 | `src/styles/theme.css` is the only place a design value is written. | enforced — `node scripts/extract-theme-values.mjs --check`, and `src/lib/design/stylesheet-discipline.test.ts` for colours in the other stylesheets | A value written anywhere else survives every theme change and is found by a user rather than by a test. |
| R-STYLE-002 | No font size and no letter-spacing in a className — not `[font-size:…]`, not `text-[13px]`, not `tracking-[-0.02em]`. Snap to a step or name it in `theme.css`. | enforced — `src/lib/design/type-discipline.test.ts` | An arbitrary size is a scale step nobody agreed to, and enough of them mean there is no scale. |
| R-STYLE-003 | A heading's weight is `font-title` (500) or `font-title-strong` (600), never `font-medium` or `font-semibold`. | reviewed | Two spellings of one weight drift apart, and only one of them follows the type system. |
| R-STYLE-004 | Headings come in two registers, public and app (below). A section heading is always smaller than the page title above it. | reviewed | A page whose section heading outweighs its title reads as two pages stapled together. |
| R-STYLE-005 | Only a token inside `@theme` becomes a utility. A token in `:root` alone generates nothing. | reviewed | It fails silently: the class name is accepted, no CSS is emitted, and the page simply looks wrong. |
| R-STYLE-006 | Untitled UI is the default. A local value earns the exception with the identity or a measurement. Where even, take theirs. | reviewed | Settling every disagreement in Card Orb's favour re-implements the library's markup against our stylesheet and throws away the design work, which is most of what it is for. |
| R-STYLE-007 | The product identity is two things: the holographic shine and the card tilt. Nothing else is protected. | reviewed | Four things were protected until Bart said the UI was not defined yet and only the card effects should stay. |
| R-STYLE-008 | No `@apply`, no `@layer components`. A shared utility string lives in one constant or one component. | reviewed | A class that hides a stack of utilities has to be opened before it can be read, and its copies drift. |
| R-STYLE-009 | Do not name a token what Tailwind names one, unless replacing Tailwind's app-wide on purpose. | reviewed | Tailwind v4's `@theme` replaces a scale rather than extending it, so `--radius-lg: 24px` silently changed `rounded-lg` inside components this project did not write. |
| R-STYLE-010 | Never give a conditionally-reset property to Tailwind unconditionally. The property stays in CSS, or the override becomes a matching variant. | reviewed | The reset wins wherever the condition does not apply, so the utility looks broken rather than overridden. |
| R-STYLE-011 | Grep the whole tree for a class name before deleting its CSS. Loading states and second render branches are the traps. | reviewed | A repo-wide grep after one migration pass found five more places still using class names that had just been deleted. |
| R-STYLE-012 | A literal class name is defined in CSS, read by a variant, or deleted. | reviewed | A third kind of class name is dead weight that reads as though something still styles it. |
| R-STYLE-013 | Controls have two shapes: `shape-round` (default) and `shape-rectangle`. Shape is a cascading property on a container, never a prop. | reviewed | Every button was one shape written five times, so asking for a different one meant overriding `className` at each call site. |
| R-STYLE-014 | A button is the component. `untitledButtonClasses.ts` is only for elements a React Aria `Button` cannot be. | reviewed | An audit found three of that file's four stated reasons for a plain `<button>` untrue; a transparent interactive row is the one that survives, because React Aria adds nothing it does not already have. |
| R-STYLE-015 | One icon set: `@untitledui-pro/icons`. | enforced — `scripts/untitled-add.mjs` rewrites imports and drops the second package | The generator keeps adding a second package, and two sets put two drawing styles on one screen. |
| R-STYLE-016 | A colour cleared as a graphic (3:1) is not cleared under a word (4.5:1). Every text-on-surface pair, every control boundary and both placeholders are measured. | enforced — `src/lib/design/contrast.test.ts` | The two WCAG thresholds differ, so a colour signed off as an icon can still fail as body text. |
| R-STYLE-017 | The page is `bg-secondary`; raised surfaces are `bg-primary`. | reviewed | Inverting the two sinks every card into the page instead of lifting it off. |
| R-STYLE-018 | `styles/poke-holo.css` is unlayered, so every rule in it beats every Tailwind utility. Know that before adding to it. | reviewed | An unlayered sheet outranks all of Tailwind, so a rule added there silently wins arguments it was never meant to enter. |
| R-STYLE-019 | The foil colours in `styles/poke-holo.css` are `--color-foil-*` in `theme.css`, like every other colour. | enforced — `src/lib/design/stylesheet-discipline.test.ts` | R-STYLE-001 has no exception for the holo sheet. |

**The two heading registers (R-STYLE-004).** Public means marketing, legal and `/brand`;
app means the signed-in screens and the four door screens.

- Page title — public `text-display-md` 36px, app `text-display-xs` 24px
- Section — public `text-display-sm` 30px, app `text-xl` 20px
- Card or sub — public `text-lg` 18px, app `text-md` 16px

Three sizes sit outside that list because it cannot hold them, and each is a token rather
than a number in a className: `text-hero` / `text-hero-narrow` (the two marketing heroes —
a clamp the stepped scale cannot express), `text-wordmark`, and `text-micro` (9px, a count
inside a 20px icon). A fourth caller for any of them means it is a scale step and belongs
in the list.

## Components — Untitled UI

| ID | Rule | Enforcement | Why |
|---|---|---|---|
| R-UI-001 | Untitled UI is the component library. Before building any UI component, search it: `npx untitledui@latest search "<description>"`. | reviewed | It covers more than it looks like it does, and the accessibility work in it is already done. |
| R-UI-002 | It exists: use it. Our need differs: a thin wrapper in `components/shared/`, never a new implementation. | reviewed | A second implementation has to be maintained against the first every time the CLI updates it. |
| R-UI-003 | Never edit `base/`, `application/`, `foundations/` or `shared-assets/` by hand. | reviewed | They are vendor code and the CLI rewrites them wholesale, reverting divergences silently. |
| R-UI-004 | Build something of our own anyway: say in one sentence what you searched for and why it was not there. | reviewed | Without that sentence nobody can tell a real gap from a search that was never run. |
| R-UI-005 | Add components with `npm run ui:add`, never `npx untitledui add` alone. Read the report it prints. | reviewed | The wrapper repairs six things the generator breaks, and the generator reverts divergences without saying so. |
| R-UI-006 | Vendored trees are exempt from this project's lint and formatting — not from `strict`. | enforced — `tsconfig.vendored.json` | The exemption is about style, not about a component that cannot render. |
| R-UI-007 | A vendored component with no consumer is not known to work. | reviewed | Nothing renders it, so nothing has ever proved the generator emitted it correctly. |
| R-UI-008 | `src/utils/` and `src/hooks/` are mixed: vendored beside first-party, exemptions per file across `eslint.config.mjs`, `.prettierignore` and both tsconfigs. A new vendored file goes in all four. | reviewed | Miss one of the four and the file either fails lint or silently escapes `strict`. |

## Cards and catalogues

| ID | Rule | Enforcement | Why |
|---|---|---|---|
| R-DATA-001 | The catalogues say what a card *is*; the collection says that you *own* it. Never the other way round. | reviewed | The rows are hand-kept and some are wrong, so the collection cannot be trusted about facts the catalogue already holds. |
| R-DATA-002 | Rarity, type and era come from the catalogue and are read-only in the UI. | reviewed | An editable copy of a catalogue fact is a second source that drifts from the first. |
| R-DATA-003 | Nothing writes a collection row the catalogue has not matched. | reviewed | An unmatched row has no card behind it, so every fact shown about it is a guess. |
| R-DATA-004 | A copy records which printing it is. `null` is "nobody has said", not `normal`. | reviewed | Defaulting the unknown to `normal` turns a missing answer into a wrong one. |
| R-DATA-005 | TCGdex's vocabulary, without exceptions — including the card-type suffix and the coarser rarity tiers. | reviewed | The two exceptions once carved out of R-DATA-001 were both "the stored value looks better", which is how a second vocabulary starts. |
| R-DATA-006 | Collection value is per user and counts copies held. | reviewed | Prices come from the shared catalogue, so only the ownership side can make the figure yours. |

## API and platform

| ID | Rule | Enforcement | Why |
|---|---|---|---|
| R-API-001 | The three routes under `/api/v1/public/<username>/` are open on purpose, carry no prices, and each has its own rate limiter. Everything else under `/api/v1/` requires a viewer. | reviewed | They exist to serve the public profile; anything wider hands out a keyed API for free. |
| R-API-002 | A public collection exposes exactly two variant fields: `rarity` and `owned`. It is an allow-list, so a new column is excluded by default. | enforced — `src/lib/core/collection/cards-public.test.ts` | `stripPrices()` nulled the price and left `card.variants` untouched, publishing purchase price, date, condition and grade. |
| R-API-003 | No paid third-party services. Recurring cost is a hard constraint. | reviewed | Bart declined the same spend twice; the free tier's failure rate is the price of that. |
| R-API-004 | A route that reads a JSON body bounds it with `readJsonBody()` and a named `BODY_LIMIT`. | enforced — `src/lib/api/body.test.ts` | Nothing else does: Next sets no limit and neither does `next.config.ts`. |
| R-API-005 | Two validation idioms, and the boundary decides. `zod` at process boundaries that run once and must fail loudly — today only `lib/core/env.ts`. Hand-written narrowing for request bodies, after `readJsonBody()` has bounded them. | reviewed | A schema for three fields costs more to read than the three `typeof` checks it replaces. |
| R-PLAT-001 | Cloudflare stays DNS-only, never proxied. | reviewed | Proxying rewrites `x-forwarded-host`, which `sameOrigin()` in `lib/api/guard.ts` depends on. |
| R-PLAT-002 | `NEXT_PUBLIC_SITE_URL` is set in Vercel's **Build** environment. | reviewed | `NEXT_PUBLIC_` is inlined at build time, so setting it only at runtime silently does nothing. |
| R-PLAT-003 | Every screen renders exactly one `<main id="main-content">`, after its own navigation. The root layout does not. | enforced — `src/app/main-landmark.test.ts` | A landmark in the root layout wraps each screen's own, and the skip link then lands above the navigation. |
| R-PLAT-004 | The `(app)` loading fallback may only draw what is true on all seven routes it covers. | reviewed | It is one file standing in for seven screens, so anything route-specific in it flashes wrong on six of them. |

---

**Where a rule and the code disagree**, the rule is dead or the code is wrong. Do not decide
that alone and do not settle it in conversation — add it to `## Open` in `STATE.md`, which is
the list the owner actually reads.
