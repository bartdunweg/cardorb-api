import { NextResponse } from "next/server";
import { NO_DATABASE_CONFIGURED, sameOrigin } from "@/lib/api/guard";
import { createRateLimiter } from "@/lib/api/rate-limit";
import { serverClient } from "@/lib/storage/supabase";

/**
 * Another confirmation link, for somebody whose first one expired.
 *
 * This existed as a sentence before it existed as a route. /auth/confirm answers
 * a spent link with "ask for a new one", and there was nowhere to ask — which
 * leaves that person genuinely stuck, because every other door is shut to them
 * too: they cannot sign in, and a password reset does not help since the
 * password was never the problem.
 *
 * Shaped like the password reset beside it, for the same reasons. It always
 * answers 200, so it cannot be used to ask whether an address has an account
 * here; the difference is only whether mail arrives. And it is rate limited,
 * because a route that sends mail to any address on request is a route that
 * sends mail to any address on request.
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
  // Silently, and 200 all the same: a limiter that announces itself here would
  // tell an address-guesser that they had found something worth slowing down for.
  if (byAddress(ip)) return NextResponse.json({ ok: true });

  let email = "";
  try {
    const body = (await req.json()) as { email?: unknown };
    if (typeof body.email === "string") email = body.email.trim();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (email.includes("@")) {
    const { error } = await db.auth.resend({ type: "signup", email });
    // Logged, never returned. Supabase refuses this for an address that is
    // already confirmed, which is a fact about somebody's account and not one
    // this endpoint may hand to whoever asked.
    if (error) console.error("Resending a confirmation failed:", error.message);
  }

  return NextResponse.json({ ok: true });
}
