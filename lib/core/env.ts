/**
 * What this deployment needs, checked once, out loud.
 *
 * Every consumer reads process.env directly and degrades on its own: no
 * NOTION_TOKEN and getCards() returns an empty collection, no CARDS_TOKEN and
 * every request is refused with a 503, no OWNER_EMAIL and signing in cannot
 * succeed. Each of those failures is sensible in isolation and together they
 * are the same symptom — a site that looks like it works and answers nothing —
 * with the cause a layer away in a log nobody is reading yet.
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
    name: "NOTION_TOKEN",
    required: true,
    without: "the collection is empty everywhere and every page says it is unavailable",
  },
  {
    name: "CARDS_TOKEN",
    required: true,
    without: "every API request answers 503 and nobody can sign in",
  },
  {
    name: "OWNER_EMAIL",
    required: true,
    without: "the sign-in form refuses every address, including the right one",
  },
  {
    name: "PUBLIC_USERNAME",
    required: false,
    without: "the public link falls back to /user/bartdunweg",
  },
  { name: "OWNER_NAME", required: false, without: "the collection is titled after 'Bart'" },
  {
    name: "NEXT_PUBLIC_SITE_URL",
    required: false,
    without: "canonicals and the sitemap use Vercel's project URL",
  },
  { name: "ALLOWED_ORIGINS", required: false, without: "only this app's own origin may post" },

  // ─── The database that is arriving ───────────────────────────────────────
  //
  // Optional for now, and that is the whole shape of the migration: the tables
  // exist, nothing reads them yet, and a deployment without these behaves
  // exactly as it did before. They move up to required on the day
  // COLLECTION_SOURCE stops defaulting to notion — see the README.
  //
  // Warned about rather than silent even while optional, because the failure
  // they cause is the one this file exists for: a URL without a key, or a key
  // without a URL, is a deployment that looks configured and answers nothing.
  {
    name: "NEXT_PUBLIC_SUPABASE_URL",
    required: false,
    without: "the collection stays on Notion and no account can be created",
  },
  {
    name: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    required: false,
    without: "the database is unreachable even where its URL is known",
  },
  {
    name: "SUPABASE_SERVICE_ROLE_KEY",
    required: false,
    without: "the import and account-deletion scripts cannot run; the app itself does not need it",
  },
  {
    name: "SECRETS_KEY",
    required: false,
    without: "a Notion connection cannot be stored, because its token could only be stored in clear",
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
