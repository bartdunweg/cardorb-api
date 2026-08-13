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
 * This only checks that a session cookie is *present*, not that it is right,
 * and that is on purpose rather than a limitation. It used to be a limitation:
 * this file was `middleware.ts`, middleware ran on the edge runtime, and
 * node:crypto's timingSafeEqual is not there, so a real comparison would have
 * had to be a string compare — a worse answer than no compare at all.
 *
 * Next 16 renamed the convention to `proxy` and moved it to the Node.js
 * runtime, so timingSafeEqual is now reachable from here and the old reason is
 * gone. The check stays a presence check anyway, for two better ones. This is
 * not the lock: every endpoint behind it verifies the key properly, so a forged
 * cookie buys a page shell that then fails to load anything. And a proxy is
 * meant to be a thin thing at the network boundary — Next's own guidance is not
 * to lean on shared modules from in here, and pulling guard.ts and its
 * node:crypto into the boundary to re-answer a question the route answers again
 * a moment later is work in the wrong place.
 *
 * What this is actually for is sending a signed-out visitor to the login
 * instead of showing them a screen built for someone else.
 */
export function proxy(req: NextRequest) {
  if (req.cookies.get(SESSION_COOKIE)?.value) return NextResponse.next();

  // /login and not /, which is the landing page now: bouncing a signed-out
  // visitor onto a page that describes the product and then asks them to find
  // the button is one click they did not ask for.
  const to = new URL("/login", req.url);
  // So the login can put you back where you were aiming rather than at the
  // dashboard every time.
  to.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(to);
}

export const config = {
  matcher: ["/cards", "/cards/:path*"],
};
