import { NextResponse } from "next/server";
import { NO_DATABASE_CONFIGURED, sameOrigin } from "../../../../lib/api/guard";
import { currentViewer } from "../../../../lib/api/viewer";
import { serverClient } from "../../../../lib/storage/supabase";
import { MIN_PASSWORD } from "../../../../lib/core/account";
import { createRateLimiter } from "../../../../lib/api/rate-limit";

/** Requires a session already, so this only bounds an account hammering its own Auth calls. */
const byAddress = createRateLimiter(15 * 60_000, 10);

const addressOf = (req: Request) =>
  req.headers.get("x-real-ip")?.trim() ||
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
  "unknown";

/**
 * Setting a new password, for somebody who is already holding a session.
 *
 * Two ways to be holding one, and this route deliberately does not care which:
 * signed in normally and changing it, or arrived through a recovery link that
 * exchanged itself for a session at /auth/confirm. Both are "the person who can
 * prove they are this account", which is the only question worth asking here.
 *
 * That is also why there is no "current password" field. It would be the right
 * thing for the first case and impossible for the second, and Supabase has a
 * setting for it (secure_password_change) that applies the rule properly to
 * both — a check here would be a worse copy of it.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (byAddress(addressOf(req)))
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const viewer = await currentViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  let password = "";
  try {
    const body = (await req.json()) as { password?: unknown };
    if (typeof body.password === "string") password = body.password;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (password.length < MIN_PASSWORD) {
    return NextResponse.json(
      { error: `A password needs at least ${MIN_PASSWORD} characters.` },
      { status: 400 },
    );
  }

  const db = await serverClient();
  if (!db) {
    return NextResponse.json({ error: NO_DATABASE_CONFIGURED }, { status: 503 });
  }

  const { error } = await db.auth.updateUser({ password });
  if (error) {
    // The one refusal worth translating. Supabase declines a password that
    // matches the current one, and it is a likely thing to type: somebody who
    // came here through a reset link often does not remember *whether* they
    // remember, and tries the one they think it is. "That password could not be
    // set" tells them nothing about which part to change.
    if (/should be different|same as the old|new password/i.test(error.message)) {
      return NextResponse.json(
        { error: "That is already your password. Pick a different one." },
        { status: 400 },
      );
    }
    console.error("Password change failed:", error.message);
    return NextResponse.json({ error: "That password could not be set." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
