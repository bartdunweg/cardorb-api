import { NextResponse } from "next/server";
import { apiError, refuse, retryAfter } from "@/lib/api/respond";
import { readJsonBody, BODY_LIMIT } from "@/lib/api/body";
import { NO_DATABASE_CONFIGURED, sameOrigin } from "@/lib/api/guard";
import { currentViewer } from "@/lib/api/viewer";
import { serverClient } from "@/lib/storage/supabase";
import { MIN_PASSWORD } from "@/lib/core/account/account";
import { createRateLimiter } from "@/lib/api/rate-limit";

/** Requires a session already, so this only bounds an account hammering its own Auth calls. */
const byAddress = createRateLimiter(15 * 60_000, 10);

const addressOf = (req: Request) =>
  req.headers.get("x-real-ip")?.trim() ||
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
  "unknown";

/**
 * Setting a new password, for somebody who is already holding a session.
 *
 * Two ways to be holding one, and this route now cares which: signed in
 * normally and changing it, or arrived through a recovery link that exchanged
 * itself for a session at /auth/confirm. A session alone is not enough for the
 * first case — a borrowed, unlocked browser is a session — so that path sends
 * the current password and this route passes it on.
 *
 * **The check is Supabase's, not this file's.** `current_password` is a
 * parameter on `updateUser`; when it is present the provider verifies it on its
 * own server before changing anything. Nothing here compares passwords, and
 * nothing here decides who has to supply one — the client sends it when its
 * form asked for it, and a request that omits it simply does not get the check.
 *
 * That sounds like a hole and is not, because of what the two paths actually
 * are. Recovery already proved possession of the account's mailbox, through a
 * single-use token this route's own /auth/confirm spent. The signed-in path
 * proved only that a browser has a valid cookie. So the parameter is required
 * exactly where the proof is weaker, which is the point.
 *
 * This docstring used to argue the opposite — no current-password field at all,
 * on the grounds that Supabase's `secure_password_change` applied the rule
 * properly to both halves. That setting is *"require reauthentication"* and
 * counts a session as recent for 24 hours, so against a borrowed unlocked
 * browser it did approximately nothing.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return apiError(403, "Forbidden");
  const wait = byAddress(addressOf(req));
  if (wait) return refuse("tooMany", { headers: retryAfter(wait) });

  const viewer = await currentViewer();
  if (!viewer) return refuse("signIn");

  let password = "";
  let currentPassword: string | undefined;
  const read = await readJsonBody<{ password?: unknown; currentPassword?: unknown }>(
    req,
    BODY_LIMIT.credentials,
  );
  if (read.kind === "too-large") return apiError(413, "Payload too large");
  if (read.kind === "invalid") return apiError(400, "Invalid request");
  const body = read.body;
  if (typeof body.password === "string") password = body.password;
  // An empty string is treated as absent rather than passed on: Supabase
  // would reject it as a wrong current password, and the message a person
  // needs there is "fill this in", which the form's own required field
  // already gives them.
  if (typeof body.currentPassword === "string" && body.currentPassword.length > 0)
    currentPassword = body.currentPassword;

  if (password.length < MIN_PASSWORD) {
    return NextResponse.json(
      { error: `A password needs at least ${MIN_PASSWORD} characters.` },
      { status: 400 },
    );
  }

  const db = await serverClient();
  if (!db) {
    return apiError(503, NO_DATABASE_CONFIGURED);
  }

  // Spread rather than passed as undefined: sending the key with no value is
  // not the same request as not sending the key, and only one of them leaves
  // the recovery path alone.
  const { error } = await db.auth.updateUser({
    password,
    ...(currentPassword ? { current_password: currentPassword } : {}),
  });
  if (error) {
    // Said plainly rather than folded into "That password could not be set",
    // which would send somebody off to change the new password when the field
    // that is wrong is the one above it. Checked before the "already your
    // password" branch below: Supabase's wording for a wrong current password
    // can also contain "new password", and the more specific reading wins.
    if (/current password|invalid credentials|incorrect password/i.test(error.message)) {
      return apiError(400, "That is not your current password.");
    }
    // The one refusal worth translating. Supabase declines a password that
    // matches the current one, and it is a likely thing to type: somebody who
    // came here through a reset link often does not remember *whether* they
    // remember, and tries the one they think it is. "That password could not be
    // set" tells them nothing about which part to change.
    if (/should be different|same as the old|new password/i.test(error.message)) {
      return apiError(400, "That is already your password. Pick a different one.");
    }
    console.error("Password change failed:", error.message);
    return apiError(400, "That password could not be set.");
  }

  return NextResponse.json({ ok: true });
}
