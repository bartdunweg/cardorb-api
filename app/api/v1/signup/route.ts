import { NextResponse } from "next/server";
import { NO_DATABASE_CONFIGURED, sameOrigin } from "../../../../lib/api/guard";
import { createRateLimiter } from "../../../../lib/api/rate-limit";
import { serverClient } from "../../../../lib/storage/supabase";
import { MAX_DISPLAY_NAME, MIN_PASSWORD, generateUsername } from "../../../../lib/core/account";

/**
 * Making an account.
 *
 * Same shape as signing in — same origin, the server does the talking, the
 * browser never learns a Supabase URL — and one thing that endpoint does not
 * have to think about: what to do when two people want the same name.
 *
 * The username is not asked for. Signup only needs an address and a password;
 * a handle is generated here (generateUsername, in lib/core/account.ts) so the
 * form has one fewer decision in front of it, and the person can pick their
 * own later from Settings, where changing it is a much smaller thing to do
 * than typing the first one under pressure.
 *
 * A *name* is asked for, and is optional. These are two different things and
 * conflating them is what this route used to do: it set display_name to the
 * generated username, so every account's name was "swift-eevee-4821" and there
 * was no way to tell a name somebody chose from one nobody did. Now an omitted
 * name is null, the public page falls back to the username (ownerLabel, in
 * lib/core/owner.ts), and Settings shows the same fallback as its placeholder.
 * One field rather than first and last: this app has no billing and no
 * shipping, so a split would buy nothing and would ask people whose name does
 * not divide in two to pretend it does.
 *
 * The username is claimed by a trigger, not by this route. handle_new_user()
 * inserts the profile in the same transaction as the account, so a name that is
 * taken fails the whole sign-up rather than leaving an account with no name to
 * reach it by. The check below is there so a collision with the generated name
 * is retried rather than surfaced; the unique index is what actually decides,
 * and it decides for both of two people signing up at once.
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
    return NextResponse.json({ error: NO_DATABASE_CONFIGURED }, { status: 503 });
  }

  if (bySignup(clientIp(req))) {
    return NextResponse.json(
      { error: "Too many accounts from here. Try again in a few minutes." },
      { status: 429 },
    );
  }

  let email = "";
  let password = "";
  let name = "";
  try {
    const body = (await req.json()) as Record<string, unknown>;
    if (typeof body.email === "string") email = body.email.trim();
    if (typeof body.password === "string") password = body.password;
    if (typeof body.name === "string") name = body.name.trim();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // Said plainly and one at a time. A form that answers "invalid input" to
  // two fields has told you nothing about which one.
  if (!email.includes("@")) {
    return NextResponse.json({ error: "That does not look like an email address." }, { status: 400 });
  }
  if (password.length < MIN_PASSWORD) {
    return NextResponse.json(
      { error: `A password needs at least ${MIN_PASSWORD} characters.` },
      { status: 400 },
    );
  }
  // The only rule a name has. It is optional, so no length floor and no shape:
  // the ceiling exists because the column has one, and a form that accepted
  // sixty-one characters would turn into a 500 from a check constraint.
  if (name.length > MAX_DISPLAY_NAME) {
    return NextResponse.json(
      { error: `A name can be at most ${MAX_DISPLAY_NAME} characters.` },
      { status: 400 },
    );
  }

  // Generated, not typed, so a collision is ours to retry rather than the
  // visitor's to read about. The word pairs are few enough that a repeat is
  // plausible; the digits make it unlikely, and a handful of attempts makes
  // it a non-issue.
  let username = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateUsername();
    const [{ data: taken }, { data: reserved }] = await Promise.all([
      db.from("profiles").select("id").eq("username", candidate).maybeSingle(),
      db.from("reserved_usernames").select("name").eq("name", candidate).maybeSingle(),
    ]);
    if (!taken && !reserved) {
      username = candidate;
      break;
    }
  }
  if (!username) {
    return NextResponse.json(
      { error: "Could not create an account right now. Try again in a moment." },
      { status: 503 },
    );
  }

  const { error } = await db.auth.signUp({
    email,
    password,
    // Read by handle_new_user() in the accounts migration, which is what turns
    // this into a profile. Nothing else reads it, and nothing should: metadata
    // is user-writable, so it is an input to the trigger and never a source of
    // truth afterwards.
    //
    // display_name is the name if one was given and absent if not. The trigger
    // already does nullif(... ->> 'display_name', ''), so both an empty string
    // and a missing key land as null, which is what "no name yet" means
    // everywhere downstream. It used to be set to `username`, which is how
    // every account ended up named after its own generated handle.
    options: { data: { username, display_name: name || undefined } },
  });

  if (error) {
    // The unique index, seen from the far side of the race the check above
    // usually wins. Almost always the email now that the username is
    // generated and pre-checked, but the message stays generic since a
    // username collision could in principle land here too.
    if (/duplicate key|already registered|unique/i.test(error.message)) {
      return NextResponse.json({ error: "That address is already in use." }, { status: 409 });
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
