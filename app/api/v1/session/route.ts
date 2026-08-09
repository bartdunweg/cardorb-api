import { NextResponse } from "next/server";
import { SESSION_COOKIE, emailIsRight, keyIsRight, sameOrigin } from "../../../../lib/api/guard";

/**
 * Signing in and out, which here means putting the key in a cookie or removing
 * it again.
 *
 * There is no account behind this. CARDS_TOKEN is one shared passcode and this
 * endpoint's only job is to move it from a form field into a place the server
 * can read while it renders a page. That is the whole reason it exists: the key
 * used to live in localStorage, which meant every render started out signed out
 * and the owner's view arrived a frame later, over the top of the public one.
 *
 * httpOnly, so the page's own JavaScript cannot read the key back. That costs
 * the x-cards-key header on browser writes and is worth it: a script that gets
 * onto this page cannot walk off with the passcode. The guard accepts the
 * cookie instead, and curl and the iOS app keep using the header.
 *
 * Deliberately not force-dynamic'd or cached: it is a POST and a DELETE, and
 * neither is ever cached by anything.
 */

/** Thirty days. Long enough not to be a chore, short enough to expire. */
const MAX_AGE = 60 * 60 * 24 * 30;

export async function POST(req: Request) {
  // Same-origin rather than the allowlist a write goes through: this form is
  // only ever served by this app, so the host it was served from is the only
  // one that may post to it, whatever that host happens to be today. See
  // sameOrigin() for why the allowlist was the wrong tool here.
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // Told apart from wrong credentials on purpose, and 503 rather than 401: a
  // deployment missing its configuration is not somebody getting it wrong, and
  // the form can say so instead of sending its user looking for a password that
  // would not work anyway.
  if (!process.env.CARDS_TOKEN || !process.env.OWNER_EMAIL) {
    console.error("CARDS_TOKEN or OWNER_EMAIL is not set: nobody can sign in");
    return NextResponse.json(
      { error: "This deployment has no account configured." },
      { status: 503 },
    );
  }

  let key = "";
  let email = "";
  try {
    const body = (await req.json()) as { key?: unknown; email?: unknown };
    if (typeof body.key === "string") key = body.key;
    if (typeof body.email === "string") email = body.email;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // No rate limiter here even though this is the one endpoint whose whole
  // purpose is checking a secret: refuseUnauthorised' limiter is per address
  // and would lock the owner out of their own tool after ten typos, on a key
  // that is a long random string rather than something guessable by hand.
  // The limiter still stands in front of every endpoint the key opens.
  // One message for both, and deliberately vague about which half was wrong.
  // "No account with that address" is a way to ask whether an address has an
  // account here, one guess at a time. There is exactly one account, so that
  // matters less than it would elsewhere, and it costs nothing to not say.
  if (!emailIsRight(email) || !keyIsRight(key)) {
    return NextResponse.json({ error: "That email or password is not right." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, key, {
    httpOnly: true,
    sameSite: "lax",
    // Off on localhost, where there is no https and the cookie would be
    // dropped, which reads as "the key is wrong" rather than "this is http".
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
