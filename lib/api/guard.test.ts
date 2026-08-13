import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  emailIsRight,
  keyFrom,
  keyIsRight,
  originAllowed,
  readHeaders,
  refuseUnauthorised,
  refuseWrite,
  sameOrigin,
  SESSION_COOKIE,
} from "./guard";

/**
 * The whole of who may read and write.
 *
 * Everything else in this project is tested at the domain layer — prices,
 * name matching, the dex — and this file was the one part with real
 * consequences and no cover at all. It decides whether a stranger sees a
 * collection that is behind a password, so the cases below are written as
 * questions an attacker would ask rather than as coverage of every branch.
 *
 * The rate limiter is per process and keyed by address, which is the one thing
 * here with memory. Every test that does not mean to exercise it sends a fresh
 * address, so one test cannot spend another's budget. The two that do exercise
 * it say so in their names.
 */

const KEY = "a-token-of-exactly-this-length-01";
const OTHER = "b-token-of-exactly-this-length-02";

/** A request from `origin`, carrying whatever credentials are passed. */
function req(
  opts: {
    origin?: string | null;
    host?: string;
    header?: string;
    cookie?: string;
    ip?: string;
    contentType?: string;
  } = {},
) {
  const h = new Headers();
  if (opts.origin) h.set("origin", opts.origin);
  h.set("host", opts.host ?? "cardorb.example");
  if (opts.header) h.set("x-cards-key", opts.header);
  if (opts.cookie) h.set("cookie", opts.cookie);
  // A distinct address per call unless one is given, so the limiter's budget is
  // never shared between tests that are not about the limiter.
  h.set("x-real-ip", opts.ip ?? `10.0.0.${Math.floor(Math.random() * 200) + 1}`);
  if (opts.contentType) h.set("content-type", opts.contentType);
  return new Request("https://cardorb.example/api/v1/collection", { headers: h });
}

beforeEach(() => {
  vi.stubEnv("CARDS_TOKEN", KEY);
  vi.stubEnv("OWNER_EMAIL", "owner@example.com");
  vi.stubEnv("ALLOWED_ORIGINS", "https://app.example, https://ios.example");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("keyIsRight", () => {
  it("accepts the configured key", () => {
    expect(keyIsRight(KEY)).toBe(true);
  });

  it("refuses a different key of the same length", () => {
    expect(OTHER.length).toBe(KEY.length);
    expect(keyIsRight(OTHER)).toBe(false);
  });

  it("refuses a prefix of the key rather than throwing", () => {
    // timingSafeEqual throws on a length mismatch. If that ever escapes, a
    // wrong-length guess becomes a 500 and a length oracle at the same time.
    expect(() => keyIsRight(KEY.slice(0, 5))).not.toThrow();
    expect(keyIsRight(KEY.slice(0, 5))).toBe(false);
  });

  it("refuses everything when the deployment has no key", () => {
    vi.stubEnv("CARDS_TOKEN", "");
    expect(keyIsRight("")).toBe(false);
    expect(keyIsRight(KEY)).toBe(false);
  });
});

describe("emailIsRight", () => {
  it("ignores case and surrounding space, because nobody types it twice the same", () => {
    expect(emailIsRight("  Owner@Example.com ")).toBe(true);
  });

  it("refuses another address", () => {
    expect(emailIsRight("someone@example.com")).toBe(false);
  });

  it("refuses everything when no owner is configured", () => {
    vi.stubEnv("OWNER_EMAIL", "");
    expect(emailIsRight("owner@example.com")).toBe(false);
    expect(emailIsRight("")).toBe(false);
  });
});

describe("keyFrom", () => {
  it("reads the header", () => {
    expect(keyFrom(req({ header: KEY }))).toBe(KEY);
  });

  it("reads the session cookie", () => {
    expect(keyFrom(req({ cookie: `${SESSION_COOKIE}=${KEY}` }))).toBe(KEY);
  });

  it("prefers the header, so a stale cookie cannot override an explicit client", () => {
    expect(keyFrom(req({ header: KEY, cookie: `${SESSION_COOKIE}=${OTHER}` }))).toBe(KEY);
  });

  it("finds the cookie among others and decodes it", () => {
    const jar = `theme=dark; ${SESSION_COOKIE}=${encodeURIComponent("a b")}; other=1`;
    expect(keyFrom(req({ cookie: jar }))).toBe("a b");
  });

  it("is empty when nothing is offered", () => {
    expect(keyFrom(req())).toBe("");
  });

  it("does not mistake a cookie whose name merely ends with the session's", () => {
    expect(keyFrom(req({ cookie: `not-${SESSION_COOKIE}=${OTHER}` }))).toBe("");
  });
});

describe("sameOrigin", () => {
  it("allows a request with no Origin, which is curl and the iOS app", () => {
    expect(sameOrigin(req())).toBe(true);
  });

  it("allows the app's own pages", () => {
    expect(sameOrigin(req({ origin: "https://cardorb.example" }))).toBe(true);
  });

  it("refuses another site", () => {
    expect(sameOrigin(req({ origin: "https://evil.example" }))).toBe(false);
  });

  it("compares against the forwarded host, since a proxy rewrites the URL", () => {
    const h = new Headers({
      origin: "https://cardorb.example",
      host: "internal-7f3a.vercel.internal",
      "x-forwarded-host": "cardorb.example",
    });
    expect(sameOrigin(new Request("https://internal/api", { headers: h }))).toBe(true);
  });

  it("refuses an Origin that is not a URL at all", () => {
    expect(sameOrigin(req({ origin: "null" }))).toBe(false);
  });
});

describe("originAllowed", () => {
  it("allows an origin on the list", () => {
    expect(originAllowed(req({ origin: "https://app.example" }))).toBe(true);
  });

  it("trims the list, so a space after a comma does not lock a client out", () => {
    expect(originAllowed(req({ origin: "https://ios.example" }))).toBe(true);
  });

  it("allows the app's own origin without it being written down", () => {
    expect(originAllowed(req({ origin: "https://cardorb.example" }))).toBe(true);
  });

  it("refuses an origin that is neither", () => {
    expect(originAllowed(req({ origin: "https://evil.example" }))).toBe(false);
  });

  it("is not fooled by an origin that merely starts with an allowed one", () => {
    expect(originAllowed(req({ origin: "https://app.example.evil.test" }))).toBe(false);
  });
});

describe("refuseUnauthorised", () => {
  it("lets the right key through", () => {
    expect(refuseUnauthorised(req({ header: KEY }))).toBeNull();
  });

  it("lets a session cookie through", () => {
    expect(refuseUnauthorised(req({ cookie: `${SESSION_COOKIE}=${KEY}` }))).toBeNull();
  });

  it("refuses no credentials at all with 401", () => {
    expect(refuseUnauthorised(req())).toEqual({
      status: 401,
      error: "That password is not right.",
    });
  });

  it("refuses a wrong key with 401", () => {
    expect(refuseUnauthorised(req({ header: OTHER }))?.status).toBe(401);
  });

  it("refuses a cross-site origin with 403, before it ever looks at the key", () => {
    const r = refuseUnauthorised(req({ origin: "https://evil.example", header: KEY }));
    expect(r).toEqual({ status: 403, error: "Forbidden" });
  });

  it("says 503 when the deployment has no key, rather than blaming the caller", () => {
    vi.stubEnv("CARDS_TOKEN", "");
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(refuseUnauthorised(req({ header: KEY }))?.status).toBe(503);
  });

  it("rate limits one address at eleven requests a minute", () => {
    const ip = "203.0.113.9";
    for (let i = 0; i < 10; i++) {
      expect(refuseUnauthorised(req({ header: KEY, ip }))).toBeNull();
    }
    expect(refuseUnauthorised(req({ header: KEY, ip }))).toEqual({
      status: 429,
      error: "Too many requests",
    });
  });

  it("does not let one address spend another's budget", () => {
    const ip = "203.0.113.10";
    for (let i = 0; i < 11; i++) refuseUnauthorised(req({ header: KEY, ip }));
    expect(refuseUnauthorised(req({ header: KEY, ip: "203.0.113.11" }))).toBeNull();
  });

  it("counts a wrong key against the limit too, so guessing is not free", () => {
    const ip = "203.0.113.12";
    for (let i = 0; i < 10; i++) refuseUnauthorised(req({ header: OTHER, ip }));
    expect(refuseUnauthorised(req({ header: KEY, ip }))?.status).toBe(429);
  });
});

describe("refuseWrite", () => {
  it("insists on JSON, which is what forces a preflight", () => {
    const r = refuseWrite(req({ header: KEY, contentType: "text/plain" }));
    expect(r).toEqual({ status: 415, error: "Invalid request" });
  });

  it("refuses a write with no content type at all", () => {
    expect(refuseWrite(req({ header: KEY }))?.status).toBe(415);
  });

  it("accepts JSON with a charset on it", () => {
    expect(
      refuseWrite(req({ header: KEY, contentType: "application/json; charset=utf-8" })),
    ).toBeNull();
  });

  it("still applies every check the read does", () => {
    const r = refuseWrite(req({ contentType: "application/json" }));
    expect(r?.status).toBe(401);
  });
});

describe("readHeaders", () => {
  it("never caches a keyed answer in a shared cache", () => {
    expect(readHeaders(req({ header: KEY }))["Cache-Control"]).toBe("private, no-store");
  });

  it("answers an allowed origin by name, not with a wildcard", () => {
    const h = readHeaders(req({ origin: "https://app.example" }));
    expect(h["Access-Control-Allow-Origin"]).toBe("https://app.example");
    expect(h["Access-Control-Allow-Credentials"]).toBe("true");
  });

  it("tells a cache the answer depends on the origin", () => {
    expect(readHeaders(req({ origin: "https://app.example" })).Vary).toBe("Origin");
  });

  it("offers no CORS headers to an origin that is not allowed", () => {
    const h = readHeaders(req({ origin: "https://evil.example" }));
    expect(h["Access-Control-Allow-Origin"]).toBeUndefined();
    expect(h["Access-Control-Allow-Credentials"]).toBeUndefined();
  });
});
