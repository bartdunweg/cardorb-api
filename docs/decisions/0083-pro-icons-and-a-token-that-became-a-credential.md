---
id: ADR-0083
title: One icon set again — Untitled UI PRO — and the licence key that turned into a credential
status: accepted
date: 2026-08-21
scope: repo
deciders: [Bart, Claude]
superseded-by: null
tags: [untitled-ui, icons, security, build]
---

# One icon set again — Untitled UI PRO — and the licence key that turned into a credential

## Context and problem statement

Asked whether Untitled UI's filled icons could be added. The first answer given
was "there is nothing to place" — wrong, and wrong from a file that was already
open: `@untitledui/icons`'s own README says the PRO version ships **4,600+ icons
across four styles**, including solid, from a private npm package. The free
package is line-only.

`@untitledui-pro/icons@0.0.3` lives on `pkg.untitledui.com` and ships
`dist/line`, `dist/solid`, `dist/duocolor` and `dist/duotone`, ~1,180 icons each,
1.4 MB packed.

## Decision

**Replace the free package outright rather than run both.** ADR-0067 removed
lucide precisely because two icon sets shipped at once, and recorded the trap:
*an identical name is not an identical icon*. Adding PRO beside the free set
would rebuild exactly that.

The swap is mechanical, and was checked before it was made rather than after:
of the **55 icons this app imports, every one exists in PRO's line set and in
its solid set, under the same name**. Same vendor, same drawings, no `Compass`
surprise. 46 files, one import path.

`solid` is now available at `@untitledui-pro/icons/solid`. **Nothing is switched
to it here** — where a filled icon belongs is a per-place design decision, and
the three places that already fill an icon do it with `fill="currentColor"` on
the line set, which still works.

## The token is a credential now, and it was inline

`.npmrc` authenticates against `pkg.untitledui.com` with a token that is **the
same string** as the licence key hardcoded in `scripts/untitled-add.mjs`.

ADR-0074 reviewed that literal and concluded it was "not a leaked credential" —
build-time only, no data access, printed by the MCP to anyone who asks. That was
true of what it was then. **It is now also the auth token for a paid private
registry**, which makes committing it a different thing than the earlier
assessment allowed for.

So:

- The literal is gone. The script reads `UNTITLED_UI_LICENSE` or `NPM_TOKEN` and
  exits with an explanation if neither is set.
- `.npmrc` is committed and carries **no secret**: it uses `${NPM_TOKEN}`, which
  npm expands at install time.
- `NPM_TOKEN` has to exist in Vercel's build environment. **Without it the build
  fails on the `@untitledui-pro` scope** — loudly, rather than silently falling
  back to something else.

## Consequences

- **`npm install` on a clean machine now needs a secret.** It did not before.
  That is a real change to how this project is built and it is the actual cost of
  this decision, more than the licence fee.
- Measured: gzipped client JS went **609.8 → 602.5 kB**. Slightly smaller, and
  either way not the reason to do it.
- If the token is ever rotated, three places need it: `.npmrc`'s environment,
  Vercel, and whatever the MCP hands out.

## Related

- `docs/decisions/0067-one-icon-set.md` — why two sets was the thing to avoid.
- `docs/decisions/0074-the-unfinished-half-of-the-rate-limit-review.md` — the
  earlier reading of this same string, which this record supersedes on that one
  point.
