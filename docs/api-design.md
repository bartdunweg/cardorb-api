# The Card Orb API — design

Where the API is going, and the first step taken. `public/openapi.yaml` is the contract; this
file is the reasoning around it. Where the two disagree, the contract is right and this file
is stale.

## What this repository is

- **The API is the product.** The web tool and the iOS app are two clients of one API, and
  this repository serves it. The web tool stays here — it is a client that happens to be
  deployed from the same code — but it is no longer what the repository is *for*.
- **Two clients, both ours.** The iOS app (`bartdunweg/cardorb-ios`) and the web tool. No
  third party is served yet, and nothing here is designed for one: no developer keys, no
  portal, no per-client rate plans.
- **The stack does not change.** Next.js route handlers under `src/app/api/v1`, domain logic
  under `src/lib/core`, Postgres at Supabase, deployed on Vercel. A second runtime would be a
  second thing to keep in step with the first.

## What was true before this step

An inventory of every handler under `src/app/api/v1`, taken before anything changed:

| Fact | Count |
| --- | --- |
| Route files | 28 |
| Operations (method + path) | 34 |
| Hand-typed `NextResponse.json({ error: … })` calls | 102 |
| Wordings of "there is no database" | 4 |
| Bodies with no `error` key on a failure | 1 (`/v1/health`) |
| Machine-readable descriptions of the API | 0 |

The convention — `{ "error": "<sentence>" }` at a status a client can branch on — held on
every route. It held by habit, and the drift had started: one 413 said `Invalid request`,
and the same missing-database condition was worded four ways.

## Decisions

### The API has its own host: `api.cardorb.com`

- `https://api.cardorb.com/v1/…` is the API. `https://cardorb.com/api/v1/…` is the same
  API, under the web tool's origin.
- **One deployment, one extra domain.** `next.config.ts` rewrites, conditional on the `host`
  header: `/v1/:path*` → `/api/v1/:path*`, `/` → `/docs/api`. `/openapi.yaml` is a static
  file and needs no rewrite. Nothing else is served on that host: a page request there lands
  on the same 404 the web tool would give.
- **The browser stays on its own origin.** The web tool keeps calling `/api/v1` on
  cardorb.com, because its session is a cookie scoped to cardorb.com and a browser would not
  send it to api.cardorb.com. The iOS app sends a bearer token, which crosses hosts freely,
  so it is the client that moves to the new host.
- **Consequences to know:**
  - `sameOrigin()` compares `Origin` with `x-forwarded-host`. On api.cardorb.com that check
    refuses a browser on cardorb.com, which is correct: the same-origin routes (sign-in,
    sign-up, password, email) are the web tool's forms and are not meant to be called
    cross-host.
  - Cloudflare stays DNS-only for the new host too (R-PLAT-001). A proxied host rewrites the
    header the rewrite reads.
  - HSTS already carries `includeSubDomains`, so the new host is covered the moment it exists.
- **What the owner has to do by hand:** add `api.cardorb.com` to the Vercel project and a
  CNAME for it at Cloudflare, DNS-only. Until then the rewrites match nothing and change
  nothing.

### One contract: `public/openapi.yaml`

- OpenAPI 3.1, one file, served as-is at `/openapi.yaml` on both hosts.
- **A test keeps it true.** `src/app/api/openapi.test.ts` walks the App Router's file layout
  and holds it against the contract in both directions: a handler with no operation and an
  operation with no handler both fail, naming the pair. It also checks that every 4xx and
  5xx response references the shared `Error` schema, and that every `$ref` resolves.
- **The reference page is rendered from it.** `/docs/api` (and `/` on the API host) reads the
  contract at build time and draws plain HTML. No Swagger UI, no Redoc, no script from a
  third-party host: the content security policy allows scripts from this origin only, and two
  clients we wrote do not need a try-it-out console.
- `/api/cover` is deliberately outside the contract. It is the web tool's image proxy for
  scans hosted by Limitless; it answers a picture, not JSON, and no client calls it by name.

### One error shape, written in one place

- Every failure is `{ "error": "<sentence>" }`. The sentence is for a person; the status is
  for the code. That was the convention; it is now also a rule (R-API-006) and a helper.
- `src/lib/api/respond.ts` holds `apiError()` and `refuse()`, plus `REFUSALS`: the generic
  status-and-sentence pairs that used to be re-typed. `guard.ts`'s `NO_DATABASE_CONFIGURED`
  now reads from there, so there is one wording.
- **No `code` key, yet.** Both clients display the sentence and branch on the status. A
  machine-readable code would be a second thing to keep in step with the first, for no reader
  today. It can be added as an optional key without breaking either client, which is the test
  for adding it at all.
- Extra keys beside `error` exist in two places and are in the contract: `unconfirmed: true`
  on sign-in, and `header` / `guessed` on a CSV import that could not find its columns. A new
  one is a contract change and goes in `openapi.yaml` first.
- `/v1/health`'s 503 now carries an `error` sentence beside `ok: false` and `database:
  "unreachable"`, so it is no longer the one failure with no sentence.

### Success shapes stay as they are

- The contract documents what the routes answer today. Nothing was renamed: the iOS app reads
  these shapes, and a rename for tidiness is a breaking change with no reader asking for it.
- Two operations answer their object at the top level rather than under a key
  (`GET /v1/cards/{tcgId}`, `GET /v1/fields`). Documented, not changed.
- `GET /v1/imports` answers snake-case rows, because it answers the row. Documented, not
  changed.

### Versioning

- **The version is in the path.** `/v1` changes only by addition: a new field, a new route, a
  new optional query. Anything that removes, renames, or changes a type is `/v2`, served
  beside `/v1` until the last client has moved.
- `info.version` in the contract moves with additions (`1.1.0`, `1.2.0`); the path moves only
  with a break.

### Authentication — unchanged

| Scheme | Who | Where |
| --- | --- | --- |
| `bearer` — Supabase JWT | iOS app | `Authorization: Bearer <jwt>` |
| `session` — cookie | web tool | `binder_session`, scoped to cardorb.com |
| `passcode` — `x-cards-key` | curl, the snapshot script | deprecated, logged on every use |
| `cron` — `CRON_SECRET` | Vercel's cron | `/v1/cron/snapshot` only |

The three routes under `/v1/public/<username>/` and `/v1/health` take no credential, on
purpose (R-API-001). Per-user API keys are not designed: there is no third party to hand
one to.

## The migration path

1. **This step.** Contract, contract test, reference page, one error helper, host rewrites.
   No client has to change anything.
2. **Attach the host.** Vercel domain + Cloudflare CNAME, DNS-only. Verify
   `curl https://api.cardorb.com/v1/health` and that `/` there is the reference.
3. **Move the iOS app to `api.cardorb.com`.** Its base URL, nothing else. Watch the logs for
   `[deprecated] CARDS_TOKEN was used` to see what still calls with the passcode.
4. **Retire the passcode** once nothing in the logs uses it: remove the `passcode` scheme from
   the contract in the same commit as the code.
5. **Only if a third party appears:** per-user keys, a `code` key on errors, a public
   changelog for the contract. None of it before there is a reader.

## What was not done, and why

- **Not moving the web tool out.** The owner chose to keep it here. It is a client, and a
  client in the same repository costs nothing the API has to pay for.
- **Not renaming any success shape.** See above: a break with no reader asking for it.
- **Not adopting `apiError()` in all 102 call sites.** The helper exists and the four
  drifting wordings are gone. Rewriting every hand-typed refusal in one pass would touch 28
  files for no change in behaviour; each route can move over the next time it is opened.
- **Not adding a `code` key.** See above.
