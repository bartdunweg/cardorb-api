import { z } from "zod";

/**
 * What this deployment needs, checked once, out loud.
 *
 * Every consumer reads process.env directly and degrades on its own: no
 * CARDS_TOKEN and every request is refused with a 503, no
 * NEXT_PUBLIC_SUPABASE_URL and the collection is empty everywhere. Each of
 * those failures is sensible in isolation
 * and together they are the same symptom — a site that looks like it works
 * and answers nothing — with the cause a layer away in a log nobody is
 * reading yet.
 *
 * So this says it once, at boot, naming the variable. It does not throw:
 * refusing to start would turn a missing optional into an outage, and the
 * degradations are all deliberate. What it buys is that the first line of the
 * log says which one is missing.
 *
 * Called from instrumentation.ts, which Next runs once per server before any
 * request. That is also the only place it belongs: a module-level check would
 * fire wherever the module is imported, proxy.ts included, which is once per
 * matched request for an answer that cannot change between them. See the
 * comment there.
 */

type Check = { name: string; required: boolean; without: string };

const CHECKS: Check[] = [
  {
    name: "CARDS_TOKEN",
    required: true,
    without: "every API request answers 503 and nobody can sign in",
  },
  // OWNER_EMAIL was required here, and said so with "the sign-in form refuses
  // every address, including the right one". That stopped being true when
  // accounts arrived: /api/v1/session hands the address and password to
  // Supabase auth and never looks at this variable. Signing in works fine
  // without it.
  //
  // Its only reader now is guard.ts's deprecated x-cards-key path, which
  // fabricates a viewer for a passcode that names nobody and needs an email to
  // put on it. That path already refuses without OWNER_USER_ID, so this one is
  // cosmetic — hence a warning rather than an error, and a `without` that says
  // what actually happens.
  //
  // Left in rather than deleted, because a variable that is set in production
  // and read by nothing is worth naming out loud. It goes when the legacy
  // passcode path does.
  {
    name: "OWNER_EMAIL",
    required: false,
    without: "the deprecated x-cards-key path reports an empty email; signing in is unaffected",
  },
  // PUBLIC_USERNAME and OWNER_NAME were here. Both named one person for a whole
  // deployment; both are now lookups against the profile being rendered. See
  // lib/core/config.ts, where the constants were. Both can be deleted from any
  // .env file they are still sitting in: nothing reads them.
  {
    name: "NEXT_PUBLIC_SITE_URL",
    required: false,
    without: "canonicals and the sitemap use Vercel's project URL",
  },
  { name: "ALLOWED_ORIGINS", required: false, without: "only this app's own origin may post" },
  {
    name: "POKEMONTCG_API_KEY",
    required: false,
    without: "the add-card search calls pokemontcg.io unauthenticated, at a lower rate limit",
  },

  // Warned about rather than silent, because the failure they cause is the
  // one this file exists for: a URL without a key, or a key without a URL, is
  // a deployment that looks configured and answers nothing.
  {
    name: "NEXT_PUBLIC_SUPABASE_URL",
    required: true,
    without: "the collection is empty everywhere and no account can be created",
  },
  {
    name: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    required: true,
    without: "the database is unreachable even where its URL is known",
  },
  {
    name: "SUPABASE_SERVICE_ROLE_KEY",
    required: false,
    without: "account deletion and the nightly value snapshot cannot run; no page needs it",
  },
  // Warned rather than required, and the route agrees: without this the weekly
  // snapshot refuses to run at all rather than running unauthenticated. A
  // deployment that has not set it loses a chart, which is the cheap failure;
  // the expensive one would be an open write endpoint.
  {
    name: "CRON_SECRET",
    required: false,
    without: "the nightly value snapshot refuses to run, so no new points are recorded",
  },
];

/**
 * ── The second failure, which is not absence ───────────────────────────────
 *
 * Everything above answers "is it set". These answer "is it the right shape",
 * and they exist because the two fail differently. A missing
 * NEXT_PUBLIC_SUPABASE_URL is loud: the collection is empty everywhere and the
 * check above names it. A *malformed* one is quiet — @supabase/ssr builds a
 * client against it, every request fails at the network layer, and the log
 * fills with fetch errors that name a host rather than a variable.
 *
 * Shape only, and only where a wrong shape is silent. Deliberately not
 * validated: whether a key is genuinely the right key (only Supabase can say),
 * and whether the values are correct for *this* deployment (nothing here can).
 *
 * Like the checks above, this **does not throw**. Refusing to boot would turn a
 * typo into an outage, and this project's whole position on configuration is
 * that a degradation is better than a dead site — the log is what has to say
 * which one you are in. `.optional()` throughout for the same reason: absence
 * is the block above's job, and reporting it twice would bury the shape error
 * in a repeat of something already said.
 */
const SHAPES = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .url("must be a full URL, scheme included — https://<project>.supabase.co")
    .optional(),
  NEXT_PUBLIC_SITE_URL: z
    .string()
    .url("must be a full URL, scheme included — a bare host silently breaks every canonical")
    .optional(),
  /* JWTs. Length rather than a JWT parse: a truncated paste is the failure that
     happens, and it is already caught by "far too short to be one". */
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(40, "far too short to be a Supabase key")
    .optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(40, "far too short to be a Supabase key").optional(),
  /* Comma-separated origins, each a scheme + host with no path. A trailing
     slash is the common one and it makes sameOrigin() refuse silently. */
  ALLOWED_ORIGINS: z
    .string()
    .refine(
      (v) => v.split(",").every((o) => /^https?:\/\/[^/\s]+$/.test(o.trim())),
      "must be comma-separated origins with no trailing slash and no path",
    )
    .optional(),
});

export function checkEnv() {
  const missing = CHECKS.filter((c) => !process.env[c.name]?.trim());

  for (const c of missing) {
    const line = `${c.name} is not set: ${c.without}`;
    if (c.required) console.error(`[env] ${line}`);
    else console.warn(`[env] ${line}`);
  }

  /* Only what is present. An absent variable is the block above's finding, and
     saying it twice pushes the shape errors off the first screen of the log. */
  const present = Object.fromEntries(
    Object.keys(SHAPES.shape)
      .map((name) => [name, process.env[name]?.trim()])
      .filter(([, v]) => v),
  );

  const shaped = SHAPES.safeParse(present);
  if (shaped.success) return;

  for (const issue of shaped.error.issues) {
    console.error(`[env] ${issue.path.join(".")} is set but malformed: ${issue.message}`);
  }
}
