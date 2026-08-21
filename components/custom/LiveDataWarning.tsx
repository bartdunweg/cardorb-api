import { SITE_URL } from "../../lib/core/config";

/**
 * A bar that says, out loud, that this development server is writing to the
 * real database.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * This project has one Supabase project, and both `npm run dev` and production
 * talk to it. There is no dev or staging database. So a form filled in on
 * localhost is a form filled in on cardorb.com.
 *
 * That is not hypothetical. The production profile for `bartdunweg` carried the
 * display name "UI test 2416" — typed, not generated; the string appears nowhere
 * in this repository. It titled the `<title>`, the `<h1>`, the OG image and the
 * JSON-LD of an indexed, sitemapped public page, and nobody noticed until an SEO
 * review read the live HTML. A second profile still carries "UI test 2025".
 *
 * ── Why a warning and not a block ──────────────────────────────────────────
 *
 * Refusing writes from localhost was considered and rejected. Local access to
 * real data is deliberate here, not accidental: `visual/auth.setup.ts` signs in
 * as the real owner because a fresh account has no sixteen hundred cards to
 * photograph, and fixing a bad production row locally is a legitimate thing to
 * want to do. A block breaks the work; it does not address the failure.
 *
 * The failure was never a missing permission. It was somebody not realising the
 * page they were typing into was live. A visible bar addresses exactly that.
 *
 * ── Why not a separate development database ────────────────────────────────
 *
 * The obvious answer, and the wrong one for this codebase. What this project
 * *does* is match a hand-kept collection against three card catalogues; a dev
 * database holding twelve cards cannot reproduce the bugs that actually happen
 * here, and one holding a copy of the real collection has to be kept in sync
 * forever by somebody who will not do it. Cost is not the objection —
 * usefulness is.
 *
 * ── The condition ──────────────────────────────────────────────────────────
 *
 * "A development server, talking to a hosted database." Not "which project is
 * production", because there is only one and nothing could tell them apart. A
 * Supabase CLI stack running locally is on 127.0.0.1:54321 and is exempt — that
 * is the setup where writing freely is safe, and the bar should not cry wolf on
 * it.
 *
 * `NODE_ENV` is compiled to "production" in any real build, so this renders
 * nothing on Vercel and the whole component tree-shakes out of the client — it
 * is a server component and returns null before it reaches anyone.
 */
export default function LiveDataWarning() {
  if (process.env.NODE_ENV === "production") return null;

  const db = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!db) return null;

  // A local Supabase stack is the safe case, and the only one.
  const local = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/.test(db);
  if (local) return null;

  const project = db.replace(/^https?:\/\//, "").replace(/\.supabase\.co\/?$/, "");

  return (
    <div
      // `role="status"`, not `alert`: it is true for the whole session rather
      // than the result of an action, so it should be announced when reached
      // rather than interrupting whatever is being read.
      role="status"
      // `bg-error-solid`, the token, not a hand-picked red. The first version of
      // this file wrote `bg-[#7f1d1d]` and the repo's own raw-hex guard failed
      // the build for it — which is the guard doing exactly its job, on the file
      // whose whole subject is not letting the wrong thing through quietly.
      className="sticky top-0 [z-index:var(--z-skip)] flex flex-wrap items-center
        justify-center gap-x-2 gap-y-1 px-4 py-2 text-center
        bg-error-solid text-white font-body text-xs"
    >
      <strong className="font-semibold">Live data.</strong>
      <span>
        This development server writes to the real database ({project}). Anything you save here is
        saved on cardorb.com.
      </span>
      <span className="opacity-75">Site URL: {SITE_URL}</span>
    </div>
  );
}
