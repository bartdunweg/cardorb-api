import { NextResponse } from "next/server";

/**
 * Same-origin passthrough for cover art whose host does not send CORS headers.
 *
 * The card requests covers with crossOrigin="anonymous" so it can read a tint
 * off them, and an image without `Access-Control-Allow-Origin` then fails to
 * load at all rather than merely failing to be sampled. Served from our own
 * origin the question never comes up, and the CSP needs nothing beyond 'self'.
 *
 * Only used where it is actually needed: lib/core/cards.ts rewrites a Limitless
 * URL to this route and links every other source directly.
 *
 * Deliberately outside /v1. This is plumbing for the web tool's own <img> tags,
 * not part of the API an iOS client is written against, so it does not belong
 * in a contract that promises to keep its shape.
 */

// An allowlist, not a general proxy: without it this is an open relay that
// serves arbitrary bytes from our domain.
const ALLOWED = new Set(["limitlesstcg.nyc3.cdn.digitaloceanspaces.com"]);

const YEAR = 60 * 60 * 24 * 365;

export async function GET(request: Request) {
  const target = new URL(request.url).searchParams.get("url");
  if (!target) return new NextResponse("Missing url", { status: 400 });

  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return new NextResponse("Bad url", { status: 400 });
  }
  if (url.protocol !== "https:" || !ALLOWED.has(url.hostname)) {
    return new NextResponse("Host not allowed", { status: 403 });
  }

  try {
    const res = await fetch(url, { next: { revalidate: YEAR } });
    if (!res.ok) return new NextResponse("Upstream error", { status: 502 });
    const type = res.headers.get("content-type") ?? "";
    // The allowlist keeps this honest already; this makes sure a compromised
    // path still cannot serve HTML or a script from our origin.
    if (!type.startsWith("image/")) return new NextResponse("Not an image", { status: 502 });

    return new NextResponse(res.body, {
      headers: {
        "Content-Type": type,
        // Card art at a fixed URL never changes, so this can be cached hard.
        "Cache-Control": `public, max-age=${YEAR}, immutable`,
      },
    });
  } catch {
    return new NextResponse("Upstream error", { status: 502 });
  }
}
