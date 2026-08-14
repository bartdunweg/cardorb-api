import { NextResponse } from "next/server";
import { sameOrigin } from "../../../../lib/api/guard";
import { currentViewer } from "../../../../lib/api/viewer";
import { serverClient } from "../../../../lib/storage/supabase";
import { claimUsername } from "../../../../lib/storage/postgres";
import { validateUsername } from "../../../../lib/core/account";

/**
 * Changing the name in /user/<name>.
 *
 * Through the claim_username RPC rather than an update, because the reserved
 * list has to be consulted inside the same statement: two people pressing the
 * button on the same name at the same moment must not both be told yes. It has
 * existed in the database since the accounts migration with no callers at all.
 *
 * Shape checked here before the round trip, so the common mistakes — capitals,
 * a leading hyphen, too short — are answered by a sentence about the mistake
 * rather than by a constraint violation the route has to translate.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const viewer = await currentViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  let wanted = "";
  try {
    const body = (await req.json()) as { username?: unknown };
    if (typeof body.username === "string") wanted = body.username.trim().toLowerCase();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (wanted === viewer.username) return NextResponse.json({ ok: true, username: wanted });

  const shape = validateUsername(wanted);
  if (!shape.ok) return NextResponse.json({ error: shape.error }, { status: 400 });

  const db = await serverClient();
  if (!db) {
    return NextResponse.json({ error: "This deployment has no database configured." }, { status: 503 });
  }

  const result = await claimUsername(db, wanted);
  if (result.ok) return NextResponse.json({ ok: true, username: wanted });

  // Two refusals, two sentences. Collapsing them would make the reserved list
  // read as a very popular set of usernames.
  const said = {
    reserved: { error: "That name is not available.", status: 409 },
    taken: { error: "That name is taken.", status: 409 },
    failed: { error: "That name could not be claimed.", status: 500 },
  }[result.reason];

  return NextResponse.json({ error: said.error }, { status: said.status });
}
