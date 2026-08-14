import { NextResponse } from "next/server";
import { authorise, readHeaders, refused } from "../../../../lib/api/guard";
import data from "../../../../lib/core/collection-value.generated.json";

export async function GET(req: Request) {
  const viewer = await authorise(req);
  if (refused(viewer))
    return NextResponse.json({ error: viewer.error }, { status: viewer.status, headers: readHeaders(req) });
  return NextResponse.json({ snapshots: data.snapshots }, { headers: readHeaders(req) });
}
