import { NextResponse } from "next/server";
import { sameOrigin } from "../../../../lib/api/guard";
import { currentViewer } from "../../../../lib/api/viewer";
import { serverClient } from "../../../../lib/storage/supabase";
import { SITE_URL } from "../../../../lib/core/config";

/**
 * Moving an account to another address.
 *
 * Confirmed on both sides, which is Supabase's default and worth keeping: the
 * new address has to prove it exists, and the old one has to agree to lose the
 * account. Without the second half, anyone who borrows a signed-in browser for
 * a minute owns the account permanently.
 *
 * supabase/templates/email-change.html was written when the accounts work went
 * in, before there was anything to trigger it. This is what triggers it.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const viewer = await currentViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  let email = "";
  try {
    const body = (await req.json()) as { email?: unknown };
    if (typeof body.email === "string") email = body.email.trim();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!email.includes("@")) {
    return NextResponse.json({ error: "That does not look like an email address." }, { status: 400 });
  }
  if (email.toLowerCase() === viewer.email.toLowerCase()) {
    return NextResponse.json({ error: "That is already your address." }, { status: 400 });
  }

  const db = await serverClient();
  if (!db) {
    return NextResponse.json({ error: "This deployment has no database configured." }, { status: 503 });
  }

  const { error } = await db.auth.updateUser(
    { email },
    { emailRedirectTo: `${SITE_URL}/auth/confirm?next=/settings/account` },
  );

  if (error) {
    // Whether the address is already registered is not this route's to reveal:
    // a signed-in person could otherwise use it to test addresses one at a
    // time. One message, and the log carries the real one.
    console.error("Email change failed:", error.message);
    return NextResponse.json({ error: "That address could not be set." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
