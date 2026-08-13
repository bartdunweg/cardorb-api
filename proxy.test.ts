import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { config, proxy } from "./proxy";
import { SESSION_COOKIE } from "./lib/api/session-cookie";

/**
 * The redirect in front of /cards.
 *
 * It is not the lock — every endpoint behind it verifies the key properly, and
 * this only checks that a cookie is present. What it is for is sending a
 * signed-out visitor to the login instead of onto a screen built for somebody
 * else, and carrying where they were aiming so the login can put them back.
 *
 * These tests call the exported function directly, so they say nothing about
 * which runtime it lands in. That is what makes them the same four assertions
 * before and after the rename from `middleware` to `proxy`: the behaviour being
 * described never depended on the runtime, only the old reasoning did.
 *
 * The matcher is asserted as well. It is the difference between this running on
 * the owner's screens and running on the public link, and getting it wrong in
 * either direction is silent: too narrow and the shell leaks, too wide and
 * /user/<name> stops being public at all.
 */

function get(path: string, cookie?: string) {
  const h = new Headers();
  if (cookie) h.set("cookie", cookie);
  return new NextRequest(new URL(`https://cardorb.example${path}`), { headers: h });
}

describe("the proxy", () => {
  it("lets a request with a session through", () => {
    const res = proxy(get("/cards", `${SESSION_COOKIE}=anything`));
    expect(res.headers.get("location")).toBeNull();
  });

  it("sends a signed-out visitor to the login", () => {
    const res = proxy(get("/cards"));
    const to = new URL(res.headers.get("location")!);
    expect(to.pathname).toBe("/login");
  });

  it("remembers where they were aiming", () => {
    const res = proxy(get("/cards/sv03-125"));
    const to = new URL(res.headers.get("location")!);
    expect(to.searchParams.get("next")).toBe("/cards/sv03-125");
  });

  it("treats an empty cookie as no cookie", () => {
    const res = proxy(get("/cards", `${SESSION_COOKIE}=`));
    expect(res.headers.get("location")).not.toBeNull();
  });
});

describe("the matcher", () => {
  const matches = (path: string) =>
    config.matcher.some((m) => {
      // ":path*" is Next's own syntax for "this segment and everything under
      // it". Turned into a regex here so the table below can be read as the
      // list of routes this actually guards.
      const re = new RegExp(`^${m.replace(/\/:path\*/, "(/.*)?")}$`);
      return re.test(path);
    });

  it("guards the owner's screens", () => {
    expect(matches("/cards")).toBe(true);
    expect(matches("/cards/sv03-125")).toBe(true);
  });

  it("leaves the public link alone, which is the whole point of it", () => {
    expect(matches("/user/bartdunweg")).toBe(false);
  });

  it("leaves the landing page, the login and the API alone", () => {
    expect(matches("/")).toBe(false);
    expect(matches("/login")).toBe(false);
    expect(matches("/api/v1/session")).toBe(false);
    expect(matches("/api/v1/collection")).toBe(false);
  });
});
