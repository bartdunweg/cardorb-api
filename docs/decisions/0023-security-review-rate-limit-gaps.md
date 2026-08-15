---
id: ADR-0023
title: Security review — closing the rate-limit and defense-in-depth gaps it found
status: accepted
date: 2026-08-15
scope: repo
deciders: [Bart]
superseded-by: null
tags: [api, security, rate-limit]
---

# Security review — closing the rate-limit and defense-in-depth gaps it found

## Context and problem statement

Bart asked for a full review of the platform's security posture, not a diff review. Three
parallel sweeps covered `lib/api/guard.ts` and session/cookie handling, every route under
`app/api/`, and secrets/config/dependencies. The overall design held up: constant-time
token comparison, RLS as the real authorization layer rather than app-side checks alone,
parameterized queries everywhere, a real CSP/HSTS/Permissions-Policy header set, and
anti-enumeration on login/signup/password-reset. Three gaps were concrete enough to fix
rather than just note.

## Findings addressed

1. `GET /api/v1/public/[username]/collection` was the one public, unauthenticated route
   with no rate limiter at all — and the most expensive of the public routes (a full
   catalogue match via `getCards()`), unlike its sibling `latest-pull`, which already had
   one from ADR-0021.
2. `email` and `password` (session-authenticated, `sameOrigin`-only mutation routes that
   call out to Supabase Auth) had no rate limiter, unlike the shape-identical `session`,
   `signup`, and `password/reset` routes.
3. `recentImports()` (`lib/storage/imports.ts`) queried `imports` with no `user_id` filter,
   relying entirely on the `imports_own` RLS policy. Every other function in that file
   documents, in a comment, why it does or doesn't double-filter; this one didn't, making
   a dropped or misconfigured policy a silent, undocumented single point of failure.

## Considered options (per finding)

1. **Public collection route**: rate-limit it (chosen) vs. leave it, reasoning it's behind
   the same CDN cache as `latest-pull`. Rejected as leaving it — the cache is
   `s-maxage=300, stale-while-revalidate=3600`, which still lets a request straight through
   on a cold cache or a cache-busting query string; `latest-pull` carries the same cache
   headers and still got a limiter in ADR-0021.
2. **email/password routes**: rate-limit like `session`/`signup` (chosen) vs. leave
   unlimited, reasoning the caller already holds a session. Rejected as leaving unlimited —
   these are the two routes in that group that make an external Supabase Auth call per
   request, so an already-authenticated account hammering its own endpoint is still a real
   cost, not just a self-inflicted no-op.
3. **recentImports**: add `.eq("user_id", ...)` (chosen) vs. add only a comment explaining
   the RLS-only design (as some other reads in the codebase do). Chosen the filter, not
   just the comment, because this route returns a full list rather than a single
   already-scoped row (contrast `account` route's `deleteUser(viewer.userId)`), so the
   blast radius of a dropped policy is "every user's import history" rather than a 404.

## Decision

- `app/api/v1/public/[username]/collection/route.ts` gained the same
  `createRateLimiter(60_000, 60)` pattern as `latest-pull/route.ts`.
- `app/api/v1/email/route.ts` and `app/api/v1/password/route.ts` gained
  `createRateLimiter(15 * 60_000, 10)`, applied after the existing `sameOrigin` check.
- `recentImports(db, userId, limit = 10)` now takes the caller's id and filters on it; both
  call sites (`app/api/v1/imports/route.ts`, `app/settings/import/page.tsx`) pass
  `viewer.userId`.

Left as documented, accepted tradeoffs rather than fixed: `storeErrorResponse`'s
verbatim Postgres/PostgREST error messages (deliberate, for a single-owner API — see
inline comment in `lib/api/guard.ts`), CSP's `script-src 'unsafe-inline'` (a Next.js
inline-bootstrap-script constraint, no nonce middleware in place), the legacy
`CARDS_TOKEN`/`x-cards-key` path (already logged as deprecated), in-memory
per-instance rate limiting (ADR-0021 already accepts this), and trust in
`x-forwarded-host`/`x-real-ip` (holds as long as Vercel's edge is the only ingress).

## Consequences

- Good: closes the one public route that had zero throttling, and normalizes rate
  limiting across the session-authenticated mutation routes that call out to Supabase Auth.
- Good: a dropped or misconfigured `imports_own` policy now fails closed instead of
  leaking every account's import history.
- Neutral: `recentImports`'s signature changed (added a required `userId` parameter);
  both call sites were updated in the same change.

## Confirmation

`npm run check` (typecheck + 320 tests + lint) passes.

## Related

- Extends: `docs/decisions/0021-latest-pull-owned-only.md` (the rate-limiter pattern reused
  here)
- Code: `app/api/v1/public/[username]/collection/route.ts`, `app/api/v1/email/route.ts`,
  `app/api/v1/password/route.ts`, `lib/storage/imports.ts`, `app/api/v1/imports/route.ts`,
  `app/settings/import/page.tsx`
