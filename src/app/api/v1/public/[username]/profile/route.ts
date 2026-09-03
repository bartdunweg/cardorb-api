import { NextResponse } from "next/server";
import { apiError, PUBLIC_READ_CACHE, refuse, retryAfter } from "@/lib/api/respond";
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
  const wait = byAddress(addressOf(req));
  if (wait) return refuse("tooMany", { headers: retryAfter(wait) });

  const { username } = await params;
  const owner = await ownerOf(username);
  if (!owner) return apiError(404, "No such collection.");

  return NextResponse.json(
    { username: owner.username, displayName: owner.displayName, avatarUrl: owner.avatarUrl },
    { headers: { "Cache-Control": PUBLIC_READ_CACHE } },
  );
}
