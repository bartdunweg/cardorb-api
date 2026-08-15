---
id: ADR-0025
title: Profile avatars, stored in Supabase Storage, uploaded as a data URL
status: accepted
date: 2026-08-15
scope: repo
deciders: [Bart]
superseded-by: null
tags: [avatar, storage, profile, api]
---

# Profile avatars, stored in Supabase Storage, uploaded as a data URL

## Context and problem statement

Bart asked for the landing nav's "Signed in as {name}" to show a real profile
picture, with a way to set one if there is not one yet. Nothing in the
codebase had an avatar concept before this: no column, no bucket, no upload
route, no `<input type="file">` for anything but CSV import.

## Considered options

**Where the bytes live:**
1. **A `bytea`/base64 column on `profiles`.** Rejected: every request that
   needs a viewer (`currentViewer()`/`requestViewer()`, called on nearly
   every page) would carry the image bytes along with it, for a picture only
   the nav/settings render.
2. **Supabase Storage, a new `avatars` bucket.** Chosen. The row keeps a
   URL; only the routes that draw a picture fetch one.

**How the file gets from the browser to the server:**
1. **`multipart/form-data`.** The conventional choice for a file upload, and
   what most Supabase-with-Next.js examples show. Rejected in favour of the
   option below once the actual precedent in this codebase was checked
   (ADR discipline: look backwards before introducing a new pattern) —
   `ImportSettings.tsx`'s CSV import reads its file as text and sends it as
   a JSON field through the same `fetch(url, { body: JSON.stringify(...) })`
   helper every other write in this app uses. A second body format for one
   more upload type is a second convention to keep straight.
2. **A base64 data URL inside the existing JSON-POST convention.** Chosen.
   `app/api/v1/profile/avatar/route.ts` accepts `{ image: "data:image/png;base64,..." }`.
   Costs ~33% over the wire versus raw bytes, judged acceptable for an
   avatar resized to 256×256 client-side before it is ever encoded.

**Where the image is allowed to render from:**
1. **Proxy every avatar through a local route**, the way `/api/cover`
   already does for Limitless (which has no CORS header). Rejected as
   unnecessary here: a public Supabase Storage bucket serves images with the
   headers a browser needs directly, so the reason the Limitless proxy
   exists does not apply.
2. **Add the Supabase project's storage host to `next.config.ts`'s
   `img-src`**, the same way TCGdex/pokemontcg.io/Limitless are already
   listed. Chosen — derived from `NEXT_PUBLIC_SUPABASE_URL` at config-eval
   time rather than hard-coded, so it tracks whichever project the
   deployment actually points at.

## Decision

- **Migration** `supabase/migrations/20260815130000_profile_avatar.sql`:
  adds `profiles.avatar_url text`, creates the public `avatars` bucket, and
  four `storage.objects` policies (public read; owner-only insert/update/
  delete, gated on the object path's first folder segment equalling
  `auth.uid()`) — the same "the id is the key" shape the accounts migration
  already uses for row ownership.
- **One object per account**, at `<userId>/avatar.<ext>`, uploaded with
  `upsert: true`. Re-uploading replaces the file rather than accumulating
  orphans nothing points at.
- **Client-side resize**: `pickAvatar()` in `ProfileSettings.tsx` draws the
  picked file onto an off-DOM canvas, cover-cropped to a 256×256 square (the
  shorter side fills the frame; the longer side's overflow is cut evenly
  from both edges), and reads it back out as a PNG data URL. This is what
  keeps a multi-megabyte phone photo under the route's cap without a
  server-side image-processing dependency.
- **Server validates independently of the client**: the route re-checks the
  data URL's MIME type against an allowlist (`png`/`jpeg`/`webp`) and the
  decoded byte length against a 2MB cap — the client resizing is a courtesy,
  not the enforcement.
- **Cache-busting**: the stored URL carries a `?v=<timestamp>` query string,
  since a re-upload writes to the same path and browsers/CDNs would
  otherwise keep showing the previous file under the same URL.
- **`Viewer`** (`lib/api/viewer.ts`) gained `avatarUrl: string | null`,
  threaded through the one `viewerFrom()` both `currentViewer()` and
  `requestViewer()` call — every existing caller of either function now has
  it for free. `OwnProfile` (`lib/storage/postgres.ts`) and `updateProfile()`
  gained the matching field, following exactly the pattern `displayName`
  already used (optional key in the patch object, only written if present).

## Consequences

- Good: no new upload convention introduced beyond what `ImportSettings.tsx`
  already established; a future engineer reading either file recognises the
  same shape.
- Good: RLS on `storage.objects` means a stolen/forged bearer token still
  cannot write into another account's folder — the policy checks the path,
  not anything the client claims.
- Neutral, worth knowing: this migration has **not been applied to the live
  database**. Same posture as ADR-0021's Notion-table drop — a migration
  that changes production schema is written and reviewed here, applied
  separately and deliberately (`supabase db push` or equivalent), not run
  from this session. This workspace also has no working Supabase
  credentials configured (`.env.local` is missing
  `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`, per `STATE.md`),
  so the upload path could not be exercised end-to-end here — only
  `npm run typecheck`/`test`/`lint`.
- Bad, minor: base64 in a JSON body is not the most bandwidth-efficient way
  to move an image; judged not worth a second upload convention for a
  256×256 avatar.

## Confirmation

`npm run typecheck && npm run test && npm run lint` green. Not exercised
against a live upload (see above) — worth a real pass once Supabase
credentials are configured in a workspace and the migration has been
applied.

## Related

- `docs/decisions/0021-remove-notion-integration.md` — the migration-written-
  but-not-applied precedent this follows.
- `app/api/cover/route.ts` — the proxy pattern considered and not used here,
  and why (CORS, not CSP, was that route's actual problem).
