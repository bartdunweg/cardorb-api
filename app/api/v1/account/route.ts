import { NextResponse } from "next/server";
import { sameOrigin } from "../../../../lib/api/guard";
import { currentViewer } from "../../../../lib/api/viewer";
import { adminClient, serverClient } from "../../../../lib/storage/supabase";

/**
 * Deleting an account, and everything of its owner's with it.
 *
 * This has to exist the moment other people's data is in here, and it is worth
 * saying why it is so short: `on delete cascade` on every table that references
 * auth.users does the work. Cards, connections, imports and the profile all go
 * with the row they hang off, in one transaction, because that relationship was
 * declared in the schema rather than remembered in the application.
 *
 * The service role, because a user cannot delete themselves from auth.users
 * with their own token — that table is not theirs. It is the one request-time
 * use of that client in the app, and it is safe for the reason every use of it
 * has to be: the id it acts on comes from a verified session, never from the
 * body.
 *
 * Confirmation is the form's job, not this route's. An endpoint that asks "are
 * you sure" is an endpoint that can be answered "yes" by the same script that
 * called it.
 */
export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const viewer = await currentViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const admin = adminClient();
  if (!admin) {
    console.error("SUPABASE_SERVICE_ROLE_KEY is not set: an account cannot be deleted");
    return NextResponse.json({ error: "Accounts cannot be deleted here." }, { status: 503 });
  }

  const { error } = await admin.auth.admin.deleteUser(viewer.userId);
  if (error) {
    console.error("Deleting an account failed:", error.message);
    return NextResponse.json({ error: "That account could not be deleted." }, { status: 500 });
  }

  // The session outlives the account it named unless it is ended: the cookies
  // are still on the browser and still parse. Signed out here so the next page
  // is the landing page rather than a stack of failed lookups.
  const db = await serverClient();
  await db?.auth.signOut();

  return NextResponse.json({ ok: true });
}
