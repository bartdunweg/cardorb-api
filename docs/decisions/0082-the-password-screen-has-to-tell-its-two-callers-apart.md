---
id: ADR-0082
title: The password screen has to tell its two callers apart, and /auth/confirm is the only honest place to say which
status: accepted
date: 2026-08-21
scope: repo
deciders: [Bart, Claude]
superseded-by: null
tags: [auth, security, forms]
---

# The password screen has to tell its two callers apart, and /auth/confirm is the only honest place to say which

**Decided, not implemented.** The design is settled; the four-file change is not
written. Recorded now because the investigation behind it is the expensive part
and it is the part that gets lost.

## Context and problem statement

A security review found that nothing in this app asks for the current password
when changing it. `app/api/v1/password/route.ts` says so in its own docstring
and delegates to Supabase's `secure_password_change` — which is off.

Three things turned up while chasing that, and each one changed the answer:

1. **`secure_password_change` is the wrong setting.** It is *"Require
   reauthentication when changing password"*, and a session counts as recent for
   **24 hours**. So for the case that prompted this — a borrowed, unlocked,
   signed-in browser — it does approximately nothing. The setting that does what
   was described is a separate one, *"Require current password when changing
   password"*.
2. **`PasswordForm` serves two flows through one screen**, and
   `app/settings/password/page.tsx` says so deliberately: it is where a recovery
   link lands *and* where a signed-in person changes their password on purpose.
   Somebody arriving from a recovery link does not have the current password —
   that is why they are there. A required field would make recovery impossible.
3. **The dashboard toggle is not needed at all.** `current_password` is a
   parameter on `updateUser`, not only a setting. The app can send it on the
   signed-in path and not on the recovery path. The recovery flow is then
   untouched by construction, whatever the setting says — which also removes the
   question nobody could answer from the docs: whether Supabase exempts a
   recovery session from the requirement.

So the fix is not a toggle. It is teaching one screen which of its two callers
it is serving.

## Decision

**`app/auth/confirm/route.ts` marks the recovery arrival with an httpOnly,
short-lived cookie, and `app/settings/password/page.tsx` reads it.**

That route already knows: it receives `type=recovery` in the query string and
exchanges it through `verifyOtp`. It is server-side, it runs before the redirect,
and it can write cookies — which is why it is a route handler and not a page.

The current-password field appears only when the marker is absent, and
`current_password` is sent to `updateUser` only when the field is shown.

**The marker is a UX signal, not a security boundary, and that distinction is
the reason this is safe.** A person can set a cookie in their own browser, so
the marker cannot be trusted to *prevent* anything. It does not have to be:
whether the current password is actually required is enforced by Supabase, on
the server, from the presence of the parameter. The cookie only decides which
form to draw. Getting it wrong shows the wrong field; it does not let anybody
past a check.

## Alternatives considered

- **A query parameter on the redirect (`?recovery=1`).** Rejected. Same
  forgeability, but it is *visible and inviting* — a URL somebody can edit and
  share, and it would end up in referrer headers and logs. A cookie that is
  httpOnly and expires in minutes leaks less and suggests less.
- **Reading the session's `amr` claim** to see the method that created it.
  Cleaner in principle — no new state at all — and not taken because it could
  not be verified from the documentation in the time available, and an
  unverified claim about a JWT's contents is exactly the kind of assumption that
  had already been wrong three times on this subject.
- **Two separate routes**, one for recovery and one for the signed-in change.
  Honest, and a bigger change than the problem: the page's own comment argues
  that it is the same operation and only the arrival differs, and that argument
  still holds. What was missing was the arrival, not a second screen.
- **Turning on "Require current password" and leaving the UI alone.** Rejected:
  it would demand from the recovery half the one thing they cannot supply, and
  nobody could establish from the docs whether Supabase exempts them.

## What is left to build

Four files, in this order:

1. `app/auth/confirm/route.ts` — set the marker when `type === "recovery"`.
2. `app/settings/password/page.tsx` — read it, pass `viaRecovery` down.
3. `components/custom/PasswordForm.tsx` — render the field when
   `!viaRecovery`; its docblock currently argues the opposite and must be
   rewritten, not amended.
4. `app/hooks/useSession.ts` → `app/api/v1/password/route.ts` — thread
   `currentPassword` through `setPassword` to `updateUser`. That route's
   docstring also argues the opposite today.

**Not started deliberately.** This is the authentication flow, it spans four
files, and the session that reached this decision had already corrected three
wrong assumptions on this same subject. Beginning it without room to re-read it
is how somebody gets locked out of their own account.

## Consequences

- Until it is built, **the only safe setting to enable is *Require
  reauthentication*** — free, no code change, and it does not touch the recovery
  flow, which has its own token. It covers sessions older than 24 hours and
  nothing else. Say that plainly rather than calling it a fix.
- *Require current password* stays off until step 3 exists.
- **Leaked password protection is Pro-plan only.** It appears in the same
  advisor output and the same dashboard screen, and it costs money — it is not a
  free toggle and should not be recommended as one.

## Related

- `docs/decisions/0074-the-unfinished-half-of-the-rate-limit-review.md` — where
  `secure_password_change` was first raised, and named as a production decision.
- The live security advisor run that prompted this: no RLS findings at all, and
  the three `SECURITY DEFINER` warnings are all guarded — two are trigger
  functions that cannot be invoked over RPC, and `claim_username` raises on
  `auth.uid() is null`.
