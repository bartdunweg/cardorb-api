import { NextResponse } from "next/server";
import { authorise, readHeaders, refused } from "@/lib/api/guard";
import { bearer } from "@/lib/api/viewer";
import { getValueHistory } from "@/lib/core/collection";

/**
 * What the caller's collection has been worth, oldest reading first.
 *
 * The response shape is unchanged — `{ snapshots: [{date, value, cards, priced,
 * unpriced}] }`, values in whole euros — because the iOS app reads it and this
 * change is about whose numbers those are, not what they look like. It used to
 * import lib/core/collection-value.generated.json and hand the identical series
 * to every authenticated caller; see getValueHistory in lib/core/collection.ts
 * for what that was and why it is a per-user table now.
 *
 * The bearer is forwarded for the same reason /v1/collection forwards it: row
 * level security has to see the caller who is actually asking, and this table's
 * only policy is `user_id = auth.uid()`.
 *
 * ── One consequence, known and accepted ────────────────────────────────────
 *
 * The deprecated `x-cards-key` path answers `{"snapshots":[]}`. That header is
 * a passcode rather than an identity: guard.ts resolves it to OWNER_USER_ID,
 * but there is no session behind it, so serverClient() finds no cookies,
 * auth.uid() is null, and the policy correctly returns nothing.
 * /v1/collection survives the same path only because cards_read has an
 * `is_public` branch to fall through to, which this table deliberately does not
 * have. Not worth building an owner-shaped exception for: the path already logs
 * itself as deprecated, and the iOS app sends a bearer token.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const viewer = await authorise(req);
  if (refused(viewer))
    return NextResponse.json(
      { error: viewer.error },
      { status: viewer.status, headers: readHeaders(req) },
    );

  const snapshots = await getValueHistory(viewer.userId, bearer(req) ?? undefined);
  return NextResponse.json({ snapshots }, { headers: readHeaders(req) });
}
