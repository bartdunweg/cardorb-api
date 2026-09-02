import { describe, expect, it } from "vitest";
import {
  API_HOST,
  API_HOST_REDIRECTS,
  API_HOST_REWRITES,
  REFERENCE_URL,
} from "../../../next.config";

/**
 * api.cardorb.com is a view of this app, and the view has to point at the
 * right things: `/v1/…` at the route handlers, `/` at the reference on the web
 * app, and every rule conditional on the host, so cardorb.com itself is untouched.
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
});
