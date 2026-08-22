import { NextResponse } from "next/server";
import { readJsonBody, BODY_LIMIT } from "@/lib/api/body";
import { NO_DATABASE_CONFIGURED, sameOrigin } from "@/lib/api/guard";
import { createRateLimiter } from "@/lib/api/rate-limit";
import { serverClient } from "@/lib/storage/supabase";
import { SITE_URL } from "@/lib/core/config";

/**
 * Asking for a way back in.
 *
 * The important line in this file is the one that always answers 200. Telling
 * somebody "no account with that address" turns this endpoint into a way to ask
 * whether an address has an account here, one guess at a time, and a password
 * reset form is the most convenient place in any app to ask that question from.
 * So it says the same thing either way, and the difference is only whether an
 * email arrives.
 *
 * Needs a configured sender to do anything at all. Until then it answers
 * exactly as it will afterwards and nothing arrives, which is the wrong kind of
 * honest — see the README on custom SMTP, which is a prerequisite of open
 * signup for this reason rather than for the confirmation mail.
 */
const byAddress = createRateLimiter(15 * 60_000, 3);

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = await serverClient();
  if (!db) {
    return NextResponse.json({ error: NO_DATABASE_CONFIGURED }, { status: 503 });
  }

  const ip =
    req.headers.get("x-real-ip")?.trim() ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  // A limit even on a route that reveals nothing: without one this is a way to
  // send mail to any address, in this app's name, as often as you like.
  if (byAddress(ip)) {
    return NextResponse.json({ ok: true });
  }

  let email = "";
  const read = await readJsonBody<{ email?: unknown }>(req, BODY_LIMIT.credentials);
  if (read.kind === "too-large")
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  if (read.kind === "invalid")
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const body = read.body;
  if (typeof body.email === "string") email = body.email.trim();

  if (email.includes("@")) {
    const { error } = await db.auth.resetPasswordForEmail(email, {
      // Where the link lands. Has to be on the allowlist in config.toml, or
      // Supabase refuses the redirect and the link goes to the site root with
      // no session — which looks like the link not working.
      redirectTo: `${SITE_URL}/auth/confirm?next=/settings/password`,
    });
    // Logged, never returned. Whether this address is known is exactly what
    // this endpoint must not say.
    if (error) console.error("Password reset request failed:", error.message);
  }

  return NextResponse.json({ ok: true });
}
