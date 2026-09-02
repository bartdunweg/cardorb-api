import { describe, expect, it } from "vitest";
import { API_HOST, API_HOST_REWRITES } from "../../../next.config";

/**
 * api.cardorb.com is a view of this app, and the view has to point at the
 * right things: `/v1/…` at the route handlers, `/` at the documentation, and
 * every rewrite conditional on the host, so cardorb.com itself is untouched.
 */
describe("the API host", () => {
  it("is api.cardorb.com", () => {
    expect(API_HOST).toBe("api.cardorb.com");
  });

  it("sends /v1 to the route handlers and / to the docs", () => {
    expect(API_HOST_REWRITES.map((r) => [r.source, r.destination])).toEqual([
      ["/v1/:path*", "/api/v1/:path*"],
      ["/", "/docs/api"],
    ]);
  });

  it("only fires on that host", () => {
    for (const rewrite of API_HOST_REWRITES) {
      expect(rewrite.has).toEqual([{ type: "host", value: API_HOST }]);
    }
  });
});
