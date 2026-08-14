import { NextResponse } from "next/server";
import { sameOrigin } from "../../../../lib/api/guard";
import { createRateLimiter } from "../../../../lib/api/rate-limit";
import { serverClient } from "../../../../lib/storage/supabase";
import { MIN_PASSWORD, validateUsername } from "../../../../lib/core/account";

/**
 * Making an account.
 *
 * Same shape as signing in — same origin, the server does the talking, the
 * browser never learns a Supabase URL — and one thing that endpoint does not
 * have to think about: what to do when two people want the same name.
 *
 * The username is claimed by a trigger, not by this route. handle_new_user()
 * inserts the profile in the same transaction as the account, so a name that is
 * taken fails the whole sign-up rather than leaving an account with no name to
 * reach it by. The check below is there so the common case is a good error
 * message instead of a constraint violation; the unique index is what actually
 * decides, and it decides for both of two people pressing the button at once.
 */

/**
 * Tighter than sign-in's, and for a different reason. A wrong password is
 * somebody trying to get into one account; a hundred sign-ups is somebody
 * filling a table. Five accounts from one address in fifteen minutes is more
 * than a household needs and far less than a script wants.
 */
const bySignup = createRateLimiter(15 * 60_000, 5);

const clientIp = (req: Request) =>
  req.headers.get("x-real-ip")?.trim() ||
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
  "unknown";

export async function POST(req: Request) {
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = await serverClient();
  if (!db) {
    console.error("No database is configured: nobody can sign up");
    return NextResponse.json(
      { error: "This deployment has no database configured." },
      { status: 503 },
    );
  }

  if (bySignup(clientIp(req))) {
    return NextResponse.json(
      { error: "Too many accounts from here. Try again in a few minutes." },
      { status: 429 },
    );
  }

  let email = "";
  let password = "";
  let username = "";
  try {
    const body = (await req.json()) as Record<string, unknown>;
    if (typeof body.email === "string") email = body.email.trim();
    if (typeof body.password === "string") password = body.password;
    if (typeof body.username === "string") username = body.username.trim().toLowerCase();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // Said plainly and one at a time. A form that answers "invalid input" to
  // three fields has told you nothing about which one.
  if (!email.includes("@")) {
    return NextResponse.json({ error: "That does not look like an email address." }, { status: 400 });
  }
  if (password.length < MIN_PASSWORD) {
    return NextResponse.json(
      { error: `A password needs at least ${MIN_PASSWORD} characters.` },
      { status: 400 },
    );
  }
  const name = validateUsername(username);
  if (!name.ok) return NextResponse.json({ error: name.error }, { status: 400 });

  // The friendly check. Racy on purpose — the index below is the real decision
  // — and worth making anyway, because losing that race is rare and reading
  // "that name is taken" before you have typed a password is not.
  const { data: taken } = await db
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  if (taken) {
    return NextResponse.json({ error: "That name is taken." }, { status: 409 });
  }
  const { data: reserved } = await db
    .from("reserved_usernames")
    .select("name")
    .eq("name", username)
    .maybeSingle();
  if (reserved) {
    return NextResponse.json({ error: "That name is not available." }, { status: 409 });
  }

  const { error } = await db.auth.signUp({
    email,
    password,
    // Read by handle_new_user() in the accounts migration, which is what turns
    // this into a profile. Nothing else reads it, and nothing should: metadata
    // is user-writable, so it is an input to the trigger and never a source of
    // truth afterwards.
    options: { data: { username, display_name: username } },
  });

  if (error) {
    // The unique index, seen from the far side of the race the check above
    // usually wins.
    if (/duplicate key|already registered|unique/i.test(error.message)) {
      return NextResponse.json({ error: "That name or address is already in use." }, { status: 409 });
    }
    // Sign-ups being switched off is a deployment's decision, not the visitor's
    // mistake, and it deserves to say so rather than reading as a fault in what
    // they typed.
    if (/signups? not allowed|signup is disabled/i.test(error.message)) {
      return NextResponse.json({ error: "New accounts are closed right now." }, { status: 403 });
    }
    console.error("Sign-up failed:", error.message);
    return NextResponse.json({ error: "That account could not be created." }, { status: 400 });
  }

  // Not signed in. Confirmation is on, so what exists now is an account that
  // cannot be used until somebody opens the link in their mail — which is the
  // whole point of it, and the reason the caller must not redirect to /cards.
  //
  // `pending` says that out loud rather than leaving the client to infer it from
  // a bare ok. The previous version of this line returned the same shape whether
  // the person was signed in or not, which was fine only while confirmation was
  // off and would have become a screen that says "welcome" to somebody who is
  // still shut out.
  return NextResponse.json({ ok: true, pending: true, email });
}
