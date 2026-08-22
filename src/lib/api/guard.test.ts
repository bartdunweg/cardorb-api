import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Viewer } from "./viewer";

/**
 * Who the request turns out to be, per test.
 *
 * Mocked at the module rather than stubbed at the network, because "is this a
 * valid token" is auth-js's question and this file is about the order the door
 * asks its questions in. Setting this to null is a request with no session;
 * setting it to a viewer is one with a good token, however it arrived.
 */
let viewer: Viewer | null = null;
vi.mock("./viewer", () => ({ requestViewer: async () => viewer }));
/** Every test here runs as though a database exists; the one that does not says so. */
let hasDatabase = true;
vi.mock("../storage/supabase", () => ({ configured: () => hasDatabase }));

const {
  authorise,
  authoriseWrite,
  keyFrom,
  keyIsRight,
  originAllowed,
  readHeaders,
  refused,
  sameOrigin,
  SESSION_COOKIE,
} = await import("./guard");

const SOMEBODY: Viewer = {
  userId: "user-1",
  email: "a@example.com",
  username: "a",
  displayName: null,
  avatarUrl: null,
  onboardedAt: "2026-08-16T00:00:00.000Z",
};

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
  viewer = SOMEBODY;
  hasDatabase = true;
  vi.stubEnv("CARDS_TOKEN", KEY);
  vi.stubEnv("OWNER_USER_ID", "owner-1");
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

describe("authorise", () => {
  it("hands back who is asking rather than a yes", () => {
    // The whole of what accounts changed at the door. A boolean cannot name a
    // person, and every caller downstream needs the name.
    return authorise(req()).then((r) => {
      expect(refused(r)).toBe(false);
      expect(r).toMatchObject({ userId: "user-1" });
    });
  });

  it("refuses a request with no session at all with 401", async () => {
    viewer = null;
    const r = await authorise(req());
    expect(r).toMatchObject({ status: 401 });
  });

  it("refuses a cross-site origin with 403, before it looks at any credential", async () => {
    viewer = null;
    const r = await authorise(req({ origin: "https://evil.example" }));
    expect(r).toMatchObject({ status: 403 });
  });

  it("says 503 when the deployment has no database, rather than blaming the caller", async () => {
    hasDatabase = false;
    viewer = null;
    const r = await authorise(req());
    expect(r).toMatchObject({ status: 503 });
  });

  it("rate limits one address at twenty-one requests a minute", async () => {
    const ip = "10.9.9.9";
    for (let i = 0; i < 10; i++) await authorise(req({ ip }));
    const r = await authorise(req({ ip }));
    expect(r).toMatchObject({ status: 429 });
  });

  it("does not let one address spend another's budget", async () => {
    for (let i = 0; i < 11; i++) await authorise(req({ ip: "10.9.9.8" }));
    const r = await authorise(req({ ip: "10.9.9.7" }));
    expect(refused(r)).toBe(false);
  });

  it("counts a request with no session against the limit too, so guessing is not free", async () => {
    viewer = null;
    const ip = "10.9.9.6";
    for (let i = 0; i < 10; i++) await authorise(req({ ip }));
    const r = await authorise(req({ ip }));
    expect(r).toMatchObject({ status: 429 });
  });

  describe("the CARDS_TOKEN compatibility path", () => {
    it("lets the old shared passcode through as the owner", async () => {
      // curl and the snapshot script keep working while accounts arrive beside
      // them. On its way out; see the note on keyIsRight.
      viewer = null;
      const r = await authorise(req({ header: KEY }));
      expect(r).toMatchObject({ userId: "owner-1" });
    });

    it("refuses to be anybody when the deployment has not said who the owner is", async () => {
      // A passcode is not an identity. Without OWNER_USER_ID there is nobody
      // for it to be, and guessing would be worse than refusing.
      viewer = null;
      vi.stubEnv("OWNER_USER_ID", "");
      const r = await authorise(req({ header: KEY }));
      expect(r).toMatchObject({ status: 503 });
    });

    it("ignores a wrong passcode and falls through to the session", async () => {
      const r = await authorise(req({ header: OTHER }));
      expect(r).toMatchObject({ userId: "user-1" });
    });
  });
});

describe("authoriseWrite", () => {
  it("insists on JSON, which is what forces a preflight", async () => {
    const r = await authoriseWrite(req({ contentType: "application/json" }));
    expect(refused(r)).toBe(false);
  });

  it("refuses a write with no content type at all", async () => {
    const r = await authoriseWrite(req());
    expect(r).toMatchObject({ status: 415 });
  });

  it("accepts JSON with a charset on it", async () => {
    const r = await authoriseWrite(req({ contentType: "application/json; charset=utf-8" }));
    expect(refused(r)).toBe(false);
  });

  it("still applies every check the read does", async () => {
    viewer = null;
    const r = await authoriseWrite(req({ contentType: "application/json" }));
    expect(r).toMatchObject({ status: 401 });
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
