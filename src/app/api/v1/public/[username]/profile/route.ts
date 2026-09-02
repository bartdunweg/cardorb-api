import { NextResponse } from "next/server";
import { ownerOf } from "@/lib/core/collection/collection";
import { createRateLimiter } from "@/lib/api/rate-limit";

export const dynamic = "force-dynamic";

/**
 * The public face of a profile: the name to print and the picture. No key, like
 * its two siblings, and the same limiter and cache. The web app's /user/<name>
 * header reads this; the collection under it is the sibling route.
 */
const byAddress = createRateLimiter(60_000, 60);

const addressOf = (req: Request) =>
  req.headers.get("x-real-ip")?.trim() ||
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
  "unknown";

export async function GET(req: Request, { params }: { params: Promise<{ username: string }> }) {
  if (byAddress(addressOf(req)))
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const { username } = await params;
  const owner = await ownerOf(username);
  if (!owner) return NextResponse.json({ error: "No such collection." }, { status: 404 });

  return NextResponse.json(
    { username: owner.username, displayName: owner.displayName, avatarUrl: owner.avatarUrl },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=3600" } },
  );
}
