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
    without: "the account-deletion path cannot run; the app itself does not need it",
  },
];

export function checkEnv() {
  const missing = CHECKS.filter((c) => !process.env[c.name]?.trim());
  if (!missing.length) return;

  for (const c of missing) {
    const line = `${c.name} is not set: ${c.without}`;
    if (c.required) console.error(`[env] ${line}`);
    else console.warn(`[env] ${line}`);
  }
}
