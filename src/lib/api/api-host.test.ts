import { describe, expect, it } from "vitest";
import nextConfig, {
  API_HOST,
  API_HOST_REDIRECTS,
  API_HOST_REWRITES,
  REFERENCE_URL,
} from "../../../next.config";

/**
 * api.cardorb.com is a view of this app, and the view has to point at the
 * right things: `/v1/…` at the route handlers, `/` at the reference on the web
 * app, and every rule conditional on the host, so cardorb.com itself is untouched.
 *
 * ── What this file used to prove, which was less than it said ──────────────
 *
 * Every assertion here read the four exported constants and stopped. Nothing
 * called `nextConfig.rewrites()`, which is the only function Next ever asks —
 * the constants are a detail of how it is written. Return `{ beforeFiles: [] }`
 * from it, or forget to spread API_HOST_REWRITES into it, and this file stayed
 * green while `api.cardorb.com/v1/*` answered 404 to both clients: the iOS app
 * entirely, and the web app for every call it makes to the API host.
 *
 * So the constants are still checked — they are what the wiring is made of and
 * their values are the contract — and then the config's own functions are
 * called and held to them. That second half is the half that would have caught
 * it.
 */
describe("the API host", () => {
  it("is api.cardorb.com", () => {
    expect(API_HOST).toBe("api.cardorb.com");
  });

  it("sends /v1 to the route handlers", () => {
    expect(API_HOST_REWRITES.map((r) => [r.source, r.destination])).toEqual([
      ["/v1/:path*", "/api/v1/:path*"],
    ]);
  });

  it("sends / to the reference, which the web app draws from the contract", () => {
    expect(REFERENCE_URL).toBe("https://cardorb.com/docs/api");
    expect(API_HOST_REDIRECTS).toEqual([
      expect.objectContaining({ source: "/", destination: REFERENCE_URL, permanent: false }),
    ]);
  });

  it("only fires on that host", () => {
    for (const rule of [...API_HOST_REWRITES, ...API_HOST_REDIRECTS]) {
      expect(rule.has).toEqual([{ type: "host", value: API_HOST }]);
    }
  });

  describe("as Next actually reads it", () => {
    it("carries the rewrite in beforeFiles, where a host rule has to sit", async () => {
      // beforeFiles rather than afterFiles: `/v1/health` must be rewritten
      // before the router decides there is no such page, and afterFiles runs
      // only once it already has.
      const rewrites = await nextConfig.rewrites!();
      expect(Array.isArray(rewrites)).toBe(false);
      expect((rewrites as { beforeFiles: unknown[] }).beforeFiles).toEqual(API_HOST_REWRITES);
    });

    it("carries the root redirect", async () => {
      expect(await nextConfig.redirects!()).toEqual(API_HOST_REDIRECTS);
    });

    it("puts the security headers on every path, not only the API host's", async () => {
      // `source: "/(.*)"` and no `has`: a new screen should be protected by
      // accident rather than exposed by accident.
      const headers = await nextConfig.headers!();
      expect(headers).toHaveLength(1);
      expect(headers[0]!.source).toBe("/(.*)");
      expect(headers[0]).not.toHaveProperty("has");
      expect(headers[0]!.headers.map((h) => h.key)).toEqual([
        "Strict-Transport-Security",
        "X-Content-Type-Options",
        "Referrer-Policy",
        "Permissions-Policy",
        "Content-Security-Policy",
      ]);
    });
  });
});
