import { expect, test as setup } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * A signed-in session, so the harness can photograph the screens where the last
 * four bugs actually happened.
 *
 * ADR-0051 shipped with a stated gap: `/collection`, `/dashboard` and the
 * add-card dialog were uncovered, because they need a login. That is not a
 * detail — ADR-0020 is a bug that hid behind exactly this, a dialog's inputs
 * silently losing their styling on a route nobody could screenshot. Moving the
 * ten remaining cards.css classes without covering these would have been the
 * fifth blind attempt.
 *
 * ── How, and why not a password ────────────────────────────────────────────
 *
 * Supabase's admin API mints a one-time link for an existing account:
 * `POST /auth/v1/admin/generate_link` with `type: "magiclink"`. It returns the
 * link rather than emailing it, so nothing lands in anybody's inbox and no
 * password is typed, stored, or passed through a config file. The browser
 * follows it once, the app's own auth callback sets its own cookies, and
 * Playwright saves the result.
 *
 * A dedicated empty test account was the obvious alternative and is worse for
 * this job: an empty collection renders none of the classes in question. No
 * grid, no set headers, no counts in the rail. The screens worth photographing
 * are the ones with sixteen hundred cards in them.
 *
 * ── The constraint that keeps this honest ──────────────────────────────────
 *
 * It reads SUPABASE_SERVICE_ROLE_KEY from .env.local and refuses to run without
 * it, which means it only ever works where those local credentials already are.
 * Nothing here is committed, nothing is sent, and the storage state it writes is
 * gitignored alongside the screenshots.
 */

const STATE = path.join(__dirname, ".auth", "owner.json");

/** Whose collection. The account with cards in it, not a fresh one. */
const EMAIL = process.env.VISUAL_EMAIL ?? "bdunweg@gmail.com";

function env(): { url: string; key: string } {
  const file = path.join(__dirname, "..", ".env.local");
  const found: Record<string, string> = {};
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (m?.[1] && m[2] !== undefined) found[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? found.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? found.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return { url, key };
}

setup("sign in as the collection's owner", async ({ page, baseURL }) => {
  const { url, key } = env();
  const base = baseURL ?? "http://127.0.0.1:3210";
  // Refused rather than skipped. A harness that quietly photographs signed-out
  // pages under signed-in names is worse than one that does not run.
  expect(url && key, "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY").toBeTruthy();

  const res = await fetch(`${url}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
    /**
     * `redirect_to` at the harness's own server, not the deployment's.
     *
     * Without it the link lands on whatever Site URL the Supabase project has
     * configured — production — and the browser signs in there instead, leaving
     * the local run signed out while every assertion still passes on a page it
     * never saw. It has to be an allowed redirect in the project's auth
     * settings; localhost is by default.
     */
    body: JSON.stringify({ type: "magiclink", email: EMAIL, redirect_to: base }),
  });
  expect(res.ok, `generate_link for ${EMAIL}`).toBe(true);
  const { hashed_token } = (await res.json()) as { hashed_token: string };

  /**
   * Straight at the app's own /auth/confirm, not at Supabase's action_link.
   *
   * The action_link goes to Supabase, which verifies and then redirects to
   * `redirect_to` with the session in a URL fragment for a client-side library
   * to pick up. This app does not work that way: it has a server route that
   * takes `token_hash`, calls verifyOtp, and lets @supabase/ssr write the
   * cookies — which is the flow a real sign-in link from this app uses. Using it
   * is what makes the saved cookies the real ones rather than a forgery this
   * harness would then be testing against itself.
   *
   * generate_link returns that same hashed_token, so no email and no password.
   */
  await page.goto(`/auth/confirm?token_hash=${hashed_token}&type=magiclink&next=/dashboard`);

  // Proof, not assumption: an owner-only route that redirects when signed out.
  await page.goto("/dashboard", { waitUntil: "networkidle" });
  await expect(page).toHaveURL(/\/dashboard/);

  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  await page.context().storageState({ path: STATE });
});
