import { NextResponse } from "next/server";
import { readJsonBody, BODY_LIMIT } from "@/lib/api/body";
import { authorise, refused } from "@/lib/api/guard";
import { adminClient, readClient } from "@/lib/storage/supabase";

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
 * The password is re-verified here, not just in the form. A signed-in session
 * left open on a shared machine should not be able to end the account from a
 * button, so the modal asks for the password again and this route proves it
 * before deleting. The check goes through a throwaway anon client
 * (`persistSession: false`), so it confirms the password without touching the
 * caller's own session.
 */
export async function DELETE(req: Request) {
  const viewer = await authorise(req);
  if (refused(viewer)) return NextResponse.json({ error: viewer.error }, { status: viewer.status });

  const read = await readJsonBody<{ password?: unknown }>(req, BODY_LIMIT.credentials);
  if (read.kind === "too-large")
    return NextResponse.json({ error: "Invalid request" }, { status: 413 });
  if (read.kind === "invalid")
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const password = typeof read.body.password === "string" ? read.body.password : "";
  if (!password)
    return NextResponse.json({ error: "Enter your password to confirm." }, { status: 400 });

  const auth = readClient();
  if (!auth)
    return NextResponse.json({ error: "Accounts cannot be deleted here." }, { status: 503 });
  const { error: wrong } = await auth.auth.signInWithPassword({ email: viewer.email, password });
  if (wrong) return NextResponse.json({ error: "That password is not right." }, { status: 403 });

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
  return NextResponse.json({ ok: true });
}
