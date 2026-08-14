import { NextResponse } from "next/server";
import { serverClient } from "../../../lib/storage/supabase";
import { NO_DATABASE_CONFIGURED } from "../../../lib/api/guard";
import type { EmailOtpType } from "@supabase/supabase-js";

/**
 * Where a link in an email lands.
 *
 * A confirmation or a recovery link carries a one-time token in the query
 * string, and this route is what turns it into a session before sending the
 * reader onward. It has to be a route handler rather than a page: the exchange
 * writes cookies, and a Server Component cannot.
 *
 * A GET that changes state, which is normally a mistake and is unavoidable
 * here — the thing following the link is somebody's mail client clicking a URL.
 * What makes it safe is that the token is single-use and short-lived: a link
 * that is replayed has already been spent.
 *
 * The redirect is only ever a path within this app. `next` arrives in a query
 * string, and following whatever it says would let an email — from anyone, to
 * anyone — bounce a freshly authenticated visitor off this domain while wearing
 * its name. Same rule as the login's, for the same reason.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token_hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const wanted = url.searchParams.get("next") ?? "/cards";
  const next = wanted.startsWith("/") && !wanted.startsWith("//") ? wanted : "/cards";

  const fail = (why: string) =>
    NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(why)}`, req.url));

  if (!token_hash || !type) return fail("That link is missing something.");

  const db = await serverClient();
  if (!db) return fail(NO_DATABASE_CONFIGURED);

  const { error } = await db.auth.verifyOtp({ type, token_hash });
  if (error) {
    // Deliberately not the provider's wording. "Token has expired or is
    // invalid" is accurate and unhelpful; what a person needs to know is that
    // the link is spent and how to get another.
    console.error("Confirming a link failed:", error.message);
    return fail("That link has expired. Ask for a new one.");
  }

  return NextResponse.redirect(new URL(next, req.url));
}
