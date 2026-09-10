import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
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
 * Whether the session on this request was established with a password. See the
 * route's own note below for why that, and not "was this recovery", is the
 * question asked.
 *
 * `amr` comes back in either shape the claim allows — RFC-8176's bare strings,
 * or Supabase's entries with a timestamp — so both are read. It is the token's
 * own claim either way: getClaims() verifies the signature against the
 * project's published keys, or falls back to asking the auth server, and hands
 * back the payload only once one of those two has held. Nothing the browser
 * writes reaches it.
 *
 * Here rather than in lib/api/viewer.ts, where the rest of the claim-reading
 * lives, because one route asks this and a Viewer that carried `amr` would
 * invite the next route to draw its own conclusion from it. If a second caller
 * ever needs it, that is the moment it moves.
 */
async function provedAPassword(db: SupabaseClient): Promise<boolean> {
  const { data } = await db.auth.getClaims();
  const amr = data?.claims?.amr;
  // Not knowing is treated as yes: it costs a keystroke, and the other way
  // round it costs the account.
  if (!Array.isArray(amr) || amr.length === 0) return true;
  return amr.some((entry) => (typeof entry === "string" ? entry : entry?.method) === "password");
}

/**
 * Setting a new password, for somebody who is already holding a session.
 *
 * Two ways to be holding one, and this route decides which: signed in normally
 * and changing it, or arrived through a recovery link that exchanged itself for
 * a session at /auth/confirm. A session alone is not enough for the first case
 * — a borrowed, unlocked browser is a session — so that path must send the
 * current password, and a request that does not is refused here.
 *
 * **Verifying the password is Supabase's job; requiring one is this file's.**
 * `current_password` is a parameter on `updateUser`, and when it is present the
 * provider checks it on its own server before changing anything. Nothing here
 * compares passwords. But which caller has to supply one cannot be left to the
 * caller: this route used to send the parameter on exactly when the client
 * chose to include it, so the attacker the paragraph above describes — sitting
 * at the borrowed browser — simply left the field out of the JSON and took the
 * account. The docstring named the threat and then let the client answer it.
 *
 * So the session is asked instead, through `amr` on its own access token: the
 * authentication methods that established it, signed by the auth server and not
 * writable from the browser. A session that ever proved a password is one this
 * route makes prove it again. A session that never did is a session somebody
 * reached by spending a single-use token out of their own mailbox — recovery,
 * and the only kind of session this app issues without a password — and asking
 * that person for the password they came here because they do not have would
 * lock them out of their own account.
 *
 * Asked as "was there a password" rather than "was it recovery" on purpose.
 * Both are readable from `amr`, but only the first fails the safe way: which
 * exact method name a mail-link verification records is the auth server's
 * business and it has renamed such things before, and if that name ever changes
 * a rule written the other way round stops recognising recovery and asks a
 * locked-out person for their old password. Written this way, an unfamiliar
 * method is simply not a password, and the check it skips is one that arrival
 * had already passed by other means. A missing or unreadable `amr` is treated
 * as a password session, which asks somebody for one keystroke too many rather
 * than letting the borrowed browser through.
 *
 * The `orb-recovery` cookie (lib/api/recovery.ts) is not consulted and must not
 * be: its own comment says it is a UX signal, anybody can set it in their own
 * browser, and that is precisely the request this check exists to refuse.
 *
 * This docstring used to argue for no current-password field at all, on the
 * grounds that Supabase's `secure_password_change` applied the rule properly to
 * both halves. That setting is *"require reauthentication"* and counts a
 * session as recent for 24 hours, so against a borrowed unlocked browser it did
 * approximately nothing.
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

  // The refusal the client cannot opt out of. Asked of the session, after the
  // length floor so that somebody who typed both fields badly hears about the
  // new password first, and before updateUser so a request without the proof
  // never reaches the auth server at all.
  if (!currentPassword && (await provedAPassword(db))) {
    return apiError(400, "Enter your current password.");
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
