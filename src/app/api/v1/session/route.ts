import { NextResponse } from "next/server";
import { NO_DATABASE_CONFIGURED, sameOrigin } from "@/lib/api/guard";
import { createRateLimiter } from "@/lib/api/rate-limit";
import { serverClient } from "@/lib/storage/supabase";
import { createHash } from "node:crypto";

/**
 * Signing in and out.
 *
 * The premise this file opened with for its whole life — "there is no account
 * behind this; CARDS_TOKEN is one shared passcode and this endpoint's only job
 * is to move it from a form field into a place the server can read" — is gone.
 * There are accounts now. What is left of the old shape is the part that was
 * right for a different reason: the browser posts here, same-origin, and the
 * server does the talking. It never gets a Supabase URL of its own to call, so
 * the content security policy in next.config.ts keeps `connect-src 'self'` and
 * the app keeps making no cross-origin requests from the page at all.
 *
 * The cookies are @supabase/ssr's now rather than ours, written through the
 * client in lib/storage/supabase.ts. They are still httpOnly, and the reason is
 * unchanged: a script that gets onto this page must not be able to walk off
 * with the session. The header path is what curl and the native apps use.
 *
 * Deliberately not force-dynamic'd or cached: it is a POST and a DELETE, and
 * neither is ever cached by anything.
 */

/**
 * Two limiters, and the comment they replace is the most quotable thing in this
 * file's history. It used to argue *against* rate limiting here: "the limiter is
 * per address and would lock the owner out of their own tool after ten typos, on
 * a key that is a long random string rather than something guessable by hand."
 *
 * Both halves stopped holding on the same day. Passwords are chosen by people
 * now, so they are guessable by hand — that is the entire threat this defends
 * against. And locking one account out is no longer locking the product out,
 * because there is more than one account. The old reasoning was correct and is
 * now exactly backwards, which is worth leaving written down.
 *
 * Two of them because one is not enough. Per address catches a flood from one
 * machine. Per address *and account* catches the patient version: a slow walk
 * through one person's likely passwords, spread out enough to look like normal
 * traffic to the first limiter.
 */
const byAddress = createRateLimiter(15 * 60_000, 20);
const byAccount = createRateLimiter(15 * 60_000, 5);

/**
 * Keyed on a hash of the address rather than the address.
 *
 * The limiter's map is a plain object living in this process, and the first
 * thing anybody does while debugging a rate limit is print it. That should not
 * print a list of who has tried to sign in.
 */
const accountKey = (ip: string, email: string) =>
  createHash("sha256").update(`${ip}:${email.trim().toLowerCase()}`).digest("hex").slice(0, 32);

const clientIp = (req: Request) =>
  req.headers.get("x-real-ip")?.trim() ||
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
  "unknown";

export async function POST(req: Request) {
  // Same-origin rather than the allowlist a write goes through: this form is
  // only ever served by this app, so the host it was served from is the only
  // one that may post to it, whatever that host happens to be today.
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = await serverClient();
  // Told apart from wrong credentials on purpose, and 503 rather than 401: a
  // deployment missing its configuration is not somebody getting it wrong, and
  // the form can say so instead of sending its user looking for a password that
  // would not work anyway.
  if (!db) {
    console.error("No database is configured: nobody can sign in");
    return NextResponse.json({ error: NO_DATABASE_CONFIGURED }, { status: 503 });
  }

  let email = "";
  let password = "";
  try {
    const body = (await req.json()) as { email?: unknown; password?: unknown; key?: unknown };
    if (typeof body.email === "string") email = body.email;
    // `key` is what the old form called it, accepted so a client mid-update is
    // not a client that cannot sign in.
    if (typeof body.password === "string") password = body.password;
    else if (typeof body.key === "string") password = body.key;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const ip = clientIp(req);
  if (byAddress(ip) || byAccount(accountKey(ip, email))) {
    // The same vagueness as a wrong password, and for the same reason: "too
    // many attempts on that account" tells a stranger the account exists.
    return NextResponse.json(
      { error: "Too many attempts. Try again in a few minutes." },
      { status: 429 },
    );
  }

  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) {
    // The one refusal that is told apart, and it is a deliberate trade rather
    // than an oversight.
    //
    // An unconfirmed account is turned away with the right password. Answering
    // "that email or password is not right" is a lie in the one case where the
    // person did everything correctly, and it sends them somewhere useless:
    // they try the password again, then reset it, and the reset does not help
    // either, because the account was never the problem.
    //
    // Saying so does reveal that an account exists on this address. That is the
    // cost, and it is small here — the only way to reach this branch is to know
    // a working password for the address, and anyone who just signed up already
    // knows it exists. Every other failure stays vague, so this is not a way to
    // ask whether an address is registered; it is only a way to be told why the
    // door did not open when you had the key.
    if (/email not confirmed|not confirmed/i.test(error.message)) {
      return NextResponse.json(
        {
          error: "Confirm your email address first — the link is in your inbox.",
          unconfirmed: true,
        },
        { status: 403 },
      );
    }
    // One message for both halves, and deliberately vague about which was
    // wrong. "No account with that address" is a way to ask whether an address
    // has an account here, one guess at a time.
    return NextResponse.json({ error: "That email or password is not right." }, { status: 401 });
  }

  // No Set-Cookie here: the client in lib/storage/supabase.ts wrote the session
  // through next/headers on the way past, which is what its setAll is for.
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const db = await serverClient();
  // Nothing to sign out of, and saying so is not an error worth raising: the
  // caller wanted to end up signed out and they are.
  if (!db) return NextResponse.json({ ok: true });

  await db.auth.signOut();
  return NextResponse.json({ ok: true });
}
