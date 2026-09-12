import { NextResponse } from "next/server";
import { readJsonBody, BODY_LIMIT } from "@/lib/api/body";
import { refuse, apiError } from "@/lib/api/respond";
import { sameOrigin } from "@/lib/api/guard";
import { bearer, requestViewer, usernameOf } from "@/lib/api/viewer";
import { serverClient, userClient } from "@/lib/storage/supabase";
import { claimUsername } from "@/lib/storage/postgres";
import { validateUsername } from "@/lib/core/account/account";

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
 *
 * Bearer as well as cookie, since the iOS app has a settings screen and could
 * not reach this at all. sameOrigin() was never what blocked it — a request
 * with no Origin is not a browser and is allowed through — it was
 * currentViewer(), which only ever reads cookies, answering "Sign in first."
 * to a caller holding a perfectly good token.
 *
 * Both halves of that had to move, and the second is the one worth writing
 * down: claim_username is `security definer` but keyed on auth.uid(), so the
 * *connection* has to name the caller too. Resolving the viewer from a token
 * and then claiming through the cookie-bound serverClient() would ask Postgres
 * to act for somebody it never saw — auth.uid() would be null and the RPC
 * would raise 'not signed in'. Same rule, same shape, as PATCH /v1/profile.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return apiError(403, "Forbidden");

  const viewer = await requestViewer(req);
  if (!viewer) return refuse("signIn");

  let wanted = "";
  const read = await readJsonBody<{ username?: unknown }>(req, BODY_LIMIT.profile);
  if (read.kind === "too-large") return apiError(413, "Payload too large");
  if (read.kind === "invalid") return apiError(400, "Invalid request");
  const body = read.body;
  if (typeof body.username === "string") wanted = body.username.trim().toLowerCase();

  const shape = validateUsername(wanted);
  if (!shape.ok) return apiError(400, shape.error);

  const token = bearer(req);
  const db = token ? userClient(token) : await serverClient();
  if (!db) {
    return refuse("noDatabase");
  }

  // The name they have, read through the same connection that will claim the new one. After the
  // shape check rather than before it: a name this route would refuse anyway is not worth a query.
  if (wanted === (await usernameOf(viewer.userId, token ?? undefined))) {
    return NextResponse.json({ ok: true, username: wanted });
  }

  const result = await claimUsername(db, wanted);
  if (result.ok) {
    return NextResponse.json({ ok: true, username: wanted });
  }

  // Two refusals, two sentences. Collapsing them would make the reserved list
  // read as a very popular set of usernames.
  const said = {
    reserved: { error: "That name is not available.", status: 409 },
    taken: { error: "That name is taken.", status: 409 },
    failed: { error: "That name could not be claimed.", status: 500 },
  }[result.reason];

  return apiError(said.status, said.error);
}
