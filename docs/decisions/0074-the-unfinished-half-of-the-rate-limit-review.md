---
id: ADR-0074
title: The unfinished half of ADR-0023 — three more routes get a limiter, and one docstring gets its check
status: accepted
date: 2026-08-21
scope: repo
deciders: [Claude, on a full-repository security review]
superseded-by: null
tags: [security, rate-limiting, api]
---

# The unfinished half of ADR-0023 — three more routes get a limiter, and one docstring gets its check

## Context and problem statement

ADR-0023 closed three rate-limit gaps and said the posture otherwise held up. A
second full pass over `app/api/**` found the same shape three more times, plus
one defence that had been written down and never written.

**Four faults, all of them "the guard the file already believes it has".**

1. **`app/api/v1/public/[username]/cards/[tcgId]` had no limiter.** The third
   public unauthenticated route, and the only one without one — its two siblings
   both got theirs in ADR-0021 and ADR-0023. It is also the worst of the three
   for the reason ADR-0023 already rejected ("the CDN covers it"): the cache key
   is the *path*, and the path carries an arbitrary card id. A loop over invented
   ids is a cold miss every time — one Postgres round trip plus one outbound
   TCGdex fetch each — so the cache never sees it. The sibling collection route
   at least has one canonical URL per user.

2. **`app/api/v1/usernames/[name]` promised a same-origin check it did not
   have.** Its docstring names three defences against enumeration and calls
   enumeration "the threat". Only two existed. The route also reads through
   `adminClient()` (service role), so `profiles_read`'s `is_public or id =
   auth.uid()` is bypassed and it answers for private profiles too. With no
   origin check, a page on any domain could run it against every one of its
   visitors — and each visitor's address gets its own bucket in a per-instance
   map, so the rate limit, the defence that *was* there, was counting the wrong
   thing entirely.

3. **`app/api/v1/import/csv` had none.** The most expensive route in the app:
   `maxDuration = 300`, up to 2 MB and 5,000 rows, and a commit path that
   inserts every row. Being signed in was its only throttle. ADR-0023 added a
   limiter to `/email` and `/password` on strictly lighter reasoning — one
   external Auth call per request was judged worth it, and 5,000 inserts was not
   reached in that pass.

4. **`app/api/v1/profile/avatar` had none, and trusted the caller about the
   bytes.** The `data:` URL's own prefix decided both what got stored and its
   `Content-Type`; nothing read a magic number. The bucket is public, so
   arbitrary bytes were storable, labelled `image/png`, readable by anyone with
   the URL.

Found alongside, and fixed as documentation rather than code: `CLAUDE.md` still
said read access to `/api/v1/collection` and `/api/v1/cards/:tcgId` was
"intentionally open (no key)". Both call `authorise()` and refuse an anonymous
caller; they were closed when `/user/<name>` shipped. The instruction file was
inviting the next reviewer to "fix" a guard back off.

## Decision

**Every unauthenticated public route carries a limiter, and every expensive
authenticated one carries an account-keyed limiter.**

- `public/[username]/cards/[tcgId]` — `createRateLimiter(60_000, 60)` per
  address, matching both siblings exactly.
- `usernames/[name]` — `sameOrigin(req)` as the first line of `GET`. The
  docstring now also says what this does *not* do, which is the part that was
  missing: `sameOrigin()` passes a request with no `Origin` header by design, so
  `curl` still gets sixty a minute. Slow and attributable, not impossible.
- `import/csv` — `createRateLimiter(15 * 60_000, 10)` keyed on `viewer.userId`,
  and **only on the commit branch**. A preview writes nothing and opens no
  transaction, and it is the half a person repeats while fixing a column
  mapping; limiting it would punish the careful path.
- `profile/avatar` — `createRateLimiter(15 * 60_000, 30)` per account, plus a
  signature check (`looksLike()`) for the three accepted types.

**Keyed on the account, not the address, for the two authenticated routes.** The
cost being limited there is database writes and Storage operations, which belong
to a user rather than to a network.

## Alternatives considered

- **A limiter in middleware, applied to everything.** Rejected: the right window
  and the right key differ per route (address vs account, 60/min vs 10/15min),
  and a single global rule would be wrong everywhere in a different way.
- **Decoding the avatar image rather than checking a signature.** Rejected as
  disproportionate. `looksLike()` is a cheap "is it plausibly what it claims",
  which is enough to stop a text file or a script being stored as `image/png`.
  A malformed PNG is the browser's problem and always was.
- **Blocking `curl` on `usernames/[name]` too.** Not possible with `sameOrigin`
  as written, and changing `sameOrigin` to reject a missing `Origin` would break
  every non-browser caller of every other route. The honest fix was to state the
  limit in the docstring.
- **Leaving the `CLAUDE.md` line and fixing it "later".** Rejected. A stale
  instruction that describes a guard as absent is worse than no instruction.

## Consequences

- Both new tests were proved to fail without their fix, not just to pass with
  it. Removing the `sameOrigin` line turns
  `usernames/[name]/route.test.ts` red on exactly one test and leaves the other
  four green.
- The limiters remain in-memory and per-instance — ADR-0021 and ADR-0023 already
  accepted that tradeoff, and nothing here changes it. On Vercel Fluid an
  attacker spread across instances gets more than sixty a minute in total. This
  raises the cost; it does not make it impossible.
- `app/api/v1/import/csv` now behaves differently for preview and commit on the
  same endpoint. That is a deliberate asymmetry and is commented in place.

## Deliberately not done

- **`secure_password_change` is still `false`** in `supabase/config.toml:259`,
  and `app/api/v1/password/route.ts` delegates its only reauthentication check to
  exactly that setting — so nothing anywhere asks for the current password. This
  is the most severe finding of the review and it is **not fixed here**, because
  the file governs the local stack while the hosted project's Auth settings live
  in the dashboard and can differ. Changing it is a production decision. It is
  raised with the repository's owner and left open in `STATE.md`.
- **`scripts/untitled-add.mjs:52`'s hardcoded Untitled UI licence key.** Reviewed
  on its merits against the argument already written above it. It is not a
  credential to anything of Card Orb's, grants no data access, is build-time
  only, and `gitleaks` does not flag it — the security claim in that comment
  holds. It is a *paid entitlement* in a repository whose own rules say to write
  nothing unpublishable, which is a licensing exposure rather than a security
  one. Left as is, named here so the next reader does not rotate it in a panic,
  and flagged as something to remove before this repository is ever made public.

## Related

- `docs/decisions/0023-security-review-rate-limit-gaps.md` — the first pass, and
  the accepted tradeoffs this one deliberately did not re-litigate.
- `docs/decisions/0021-latest-pull-owned-only.md` — the limiter these copy.
- `docs/decisions/0045-public-collection-carries-two-variant-fields.md` — the
  allow-list, re-verified this pass and holding: the `finish` column added after
  it is correctly excluded.
