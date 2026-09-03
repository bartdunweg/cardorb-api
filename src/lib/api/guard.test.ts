import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Viewer } from "./viewer";
import { StoreNotConfigured } from "../storage/errors";

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
  originAllowed,
  readHeaders,
  refused,
  sameOrigin,
  storeErrorResponse,
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

/** A request from `origin`, carrying whatever credentials are passed. */
function req(
  opts: {
    origin?: string | null;
    host?: string;
    header?: string;
    cookie?: string;
    bearer?: string;
    ip?: string;
    contentType?: string;
  } = {},
) {
  const h = new Headers();
  if (opts.bearer) h.set("authorization", `Bearer ${opts.bearer}`);
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
  vi.stubEnv("OWNER_EMAIL", "owner@example.com");
  vi.stubEnv("ALLOWED_ORIGINS", "https://app.example, https://ios.example");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
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

  it("holds a request that carries a credential to a far higher ceiling, because the web app's servers share an address", async () => {
    const ip = "10.9.9.5";
    for (let i = 0; i < 50; i++) await authorise(req({ ip, bearer: "a.b.c" }));
    expect(refused(await authorise(req({ ip, bearer: "a.b.c" })))).toBe(false);
    expect(refused(await authorise(req({ ip, cookie: "binder_session=abc" })))).toBe(false);
    // The same address with nothing to show is still held to ten.
    for (let i = 0; i < 10; i++) await authorise(req({ ip }));
    expect(await authorise(req({ ip }))).toMatchObject({ status: 429 });
  });

  it("counts a request with no session against the limit too, so guessing is not free", async () => {
    viewer = null;
    const ip = "10.9.9.6";
    for (let i = 0; i < 10; i++) await authorise(req({ ip }));
    const r = await authorise(req({ ip }));
    expect(r).toMatchObject({ status: 429 });
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
    expect(readHeaders(req({ bearer: KEY }))["Cache-Control"]).toBe("private, no-store");
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

/**
 * What the client is told when the store fails.
 *
 * The store's own words used to go straight through, which put PostgREST's
 * table names, column names and constraint names on the wire for anyone with
 * a token. The words go to the log, where the one person who can act on them
 * reads them; the client gets one fixed sentence per operation and a status.
 */
describe("storeErrorResponse", () => {
  const request = () => new Request("https://cardorb.example/api/v1/x");

  it("logs the store's words and answers a fixed sentence at 502", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = storeErrorResponse(
      new Error('relation "cards" violates constraint cards_user_id_fkey'),
      request(),
      "Updating a card failed",
    );
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Updating a card failed." });
    expect(spy.mock.calls.flat().join(" ")).toContain("cards_user_id_fkey");
    spy.mockRestore();
  });

  it("answers 503 for a store that is not configured, by type rather than by wording", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = storeErrorResponse(new StoreNotConfigured(), request(), "Adding a card failed");
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "This deployment has no database configured." });
    vi.restoreAllMocks();
  });

  it("does not read 'not connected' in an ordinary failure as unconfigured", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = storeErrorResponse(
      new Error("client not connected: socket closed"),
      request(),
      "Listing folders failed",
    );
    expect(res.status).toBe(502);
    vi.restoreAllMocks();
  });
});
