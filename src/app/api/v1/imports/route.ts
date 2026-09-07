import { NextResponse } from "next/server";
import { bearer } from "@/lib/api/viewer";
import { apiError, refuse } from "@/lib/api/respond";
import { authorise, readHeaders, refused } from "@/lib/api/guard";
import { clientFor } from "@/lib/storage/collection";
import { recentImports } from "@/lib/storage/imports";

/**
 * What happened, each time somebody pressed the button.
 *
 * authorise() rather than currentViewer(), for the same reason the import
 * itself changed: currentViewer() reads a cookie, and the only screen that
 * wants this history is a web app calling from its own server with the session
 * as a bearer. This answered 401 to it — and because a list of past runs is not
 * worth failing a page over, that screen swallowed the refusal and simply
 * showed no history, quietly losing the one thing that answers "it said 1,204
 * added and I have 1,600 cards".
 */
export async function GET(req: Request) {
  const viewer = await authorise(req);
  if (refused(viewer)) {
    return apiError(viewer.status, viewer.error, undefined, {
      headers: { ...readHeaders(req), ...viewer.headers },
    });
  }

  const db = await clientFor(bearer(req) ?? undefined);
  if (!db) return refuse("noDatabase", { headers: readHeaders(req) });

  return NextResponse.json(
    { imports: await recentImports(db, viewer.userId) },
    { headers: readHeaders(req) },
  );
}
