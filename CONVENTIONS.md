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

last-reviewed: 2026-09-02

---

## Structure

| ID | Rule | Enforcement | Why |
|---|---|---|---|
| R-STRUCT-005 | `app/` is routing: a route handler reads the request, calls `lib/`, writes the response. Logic lives in `lib/`. | reviewed | Logic inside a route cannot be tested or reused without the route around it. |
| R-STRUCT-006 | `lib/core/` is `catalogue/`, `collection/` and `account/`. Only what both domains need — config, env, format, og, slug, util — stays at its root. | reviewed | Thirty files on one heap gave no hint which of them a change could reach, and the three names are the ones the rules already use. |

```
src/app/api/v1/<route>/route.ts   one route handler per operation in public/openapi.yaml
src/app/api/cover/route.ts        the image proxy, outside /v1 on purpose
src/app/layout.tsx                the root layout Next requires; there is no page
src/lib/api/                      request guards, body limits, rate limits, the error shape
src/lib/core/<domain>/            domain logic, under the domain it belongs to
src/lib/storage/                  Postgres and Supabase
public/openapi.yaml               the contract; public/artwork the scans the API links to
```

`types/` does not exist: types live beside what defines them. There is no UI in this
repository: the web app is `bartdunweg/cardorb-web`, the iOS app `bartdunweg/cardorb-ios`.

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
| R-API-006 | Every failure under `/api/v1` is `{ error: string }` at a status the client branches on. `lib/api/respond.ts` writes it; a new key beside `error` goes in the contract first. | enforced — `src/app/api/openapi.test.ts` holds every 4xx and 5xx to the `Error` schema | Two clients show the sentence and branch on the status, and a second shape would need a second reader in each. |
| R-API-007 | `public/openapi.yaml` describes every route under `src/app/api/v1` and nothing else. Code and contract change in one commit. | enforced — `src/app/api/openapi.test.ts`, both directions | A contract nothing checks stops being true the first time somebody forgets it. |
| R-API-008 | `/v1` changes only by addition. A removal, a rename or a type change is `/v2`, served beside `/v1` until the last client has moved. | reviewed | The iOS app reads these shapes and ships on Apple's schedule, not this repository's. |
| R-PLAT-001 | Cloudflare stays DNS-only, never proxied. | reviewed | Proxying rewrites `x-forwarded-host`, which `sameOrigin()` in `lib/api/guard.ts` depends on. |
| R-PLAT-002 | `NEXT_PUBLIC_SITE_URL` is set in Vercel's **Build** environment. | reviewed | `NEXT_PUBLIC_` is inlined at build time, so setting it only at runtime silently does nothing. |
| R-PLAT-005 | `api.cardorb.com` is a host-conditional rewrite of this deployment, never a second one. The browser keeps calling `/api/v1` on its own origin; only bearer clients use the host. | enforced — `src/lib/api/api-host.test.ts` | The session cookie is scoped to cardorb.com and would not cross to the API host, while a bearer token does. |

## Build and verification

| ID | Rule | Enforcement | Why |
|---|---|---|---|
| R-BUILD-001 | During iteration run `npm run check` (typecheck, test, lint). The full `./scripts/verify.sh`, which also runs `next build`, runs only at completion: before a commit or PR. | reviewed | The full build is slow and adds nothing mid-iteration that `check` does not already catch. |

---

**Where a rule and the code disagree**, the rule is dead or the code is wrong. Do not decide
that alone and do not settle it in conversation — add it to `## Open` in `STATE.md`, which is
the list the owner actually reads.
