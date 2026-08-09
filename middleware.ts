import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "./lib/api/session-cookie";

/**
 * The first thing in this app that decides who may see a page.
 *
 * /cards is the owner's screen and everything on it assumes that: prices on
 * every tile, what the collection is worth, the button that adds to it. The
 * public equivalent is /user/<name>, which is a different route rendering
 * different data rather than the same page with things hidden.
 *
 * This only checks that a session cookie is *present*, not that it is right.
 * Middleware runs on the edge runtime, where node:crypto's timingSafeEqual is
 * not available, and a string compare here would be a worse answer than no
 * compare at all. It does not need to be strict: every endpoint behind it
 * verifies the key properly, so a forged cookie buys a page shell that then
 * fails to load anything. What this is actually for is sending a signed-out
 * visitor to the login instead of showing them a screen built for someone else.
 */
export function middleware(req: NextRequest) {
  if (req.cookies.get(SESSION_COOKIE)?.value) return NextResponse.next();

  const to = new URL("/", req.url);
  // So the login can put you back where you were aiming rather than at the
  // dashboard every time.
  to.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(to);
}

export const config = {
  matcher: ["/cards", "/cards/:path*"],
};
