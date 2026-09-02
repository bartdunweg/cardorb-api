import { NextResponse } from "next/server";
import { readJsonBody, BODY_LIMIT } from "@/lib/api/body";
import { refuse, apiError } from "@/lib/api/respond";
import { sameOrigin } from "@/lib/api/guard";
import { currentViewer } from "@/lib/api/viewer";
import { serverClient } from "@/lib/storage/supabase";
import { SITE_URL } from "@/lib/core/config";
import { createRateLimiter } from "@/lib/api/rate-limit";

/** Requires a session already, so this only bounds an account hammering its own Auth calls. */
const byAddress = createRateLimiter(15 * 60_000, 10);

const addressOf = (req: Request) =>
  req.headers.get("x-real-ip")?.trim() ||
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
  "unknown";

/**
 * Moving an account to another address.
 *
 * Confirmed on both sides, which is Supabase's default and worth keeping: the
 * new address has to prove it exists, and the old one has to agree to lose the
 * account. Without the second half, anyone who borrows a signed-in browser for
 * a minute owns the account permanently.
 *
 * supabase/templates/email-change.html was written when the accounts work went
 * in, before there was anything to trigger it. This is what triggers it.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return apiError(403, "Forbidden");
  if (byAddress(addressOf(req))) return apiError(429, "Too many requests");

  const viewer = await currentViewer();
  if (!viewer) return apiError(401, "Sign in first.");

  let email = "";
  const read = await readJsonBody<{ email?: unknown }>(req, BODY_LIMIT.credentials);
  if (read.kind === "too-large") return apiError(413, "Payload too large");
  if (read.kind === "invalid") return apiError(400, "Invalid request");
  const body = read.body;
  if (typeof body.email === "string") email = body.email.trim();

  if (!email.includes("@")) {
    return apiError(400, "That does not look like an email address.");
  }
  if (email.toLowerCase() === viewer.email.toLowerCase()) {
    return apiError(400, "That is already your address.");
  }

  const db = await serverClient();
  if (!db) {
    return refuse("noDatabase");
  }

  const { error } = await db.auth.updateUser(
    { email },
    // /settings, not /settings/account: settings is one page now. Mails sent
    // before that change still say /settings/account, which next.config.ts
    // redirects here.
    { emailRedirectTo: `${SITE_URL}/auth/confirm?next=/settings` },
  );

  if (error) {
    // Whether the address is already registered is not this route's to reveal:
    // a signed-in person could otherwise use it to test addresses one at a
    // time. One message, and the log carries the real one.
    console.error("Email change failed:", error.message);
    return apiError(400, "That address could not be set.");
  }

  return NextResponse.json({ ok: true });
}
