import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, POST } from "./route";
import { SESSION_COOKIE } from "../../../../lib/api/session-cookie";

/**
 * Signing in, which is the only place in this app where a password is checked
 * and a session handed out.
 *
 * The cases below are the ones that decide whether someone gets in: each half
 * of the credentials wrong on its own, a form posted from another site, and a
 * deployment that has not been configured. The cookie's own flags are asserted
 * too — httpOnly is what stops a script on the page from walking off with the
 * key, and it is exactly the sort of option that survives a refactor as a
 * default rather than as an intention.
 */

const KEY = "a-token-of-exactly-this-length-01";
const EMAIL = "owner@example.com";

function post(body: unknown, opts: { origin?: string | null; host?: string } = {}) {
  const h = new Headers({ "content-type": "application/json" });
  h.set("host", opts.host ?? "cardorb.example");
  if (opts.origin !== null) h.set("origin", opts.origin ?? "https://cardorb.example");
  return new Request("https://cardorb.example/api/v1/session", {
    method: "POST",
    headers: h,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.stubEnv("CARDS_TOKEN", KEY);
  vi.stubEnv("OWNER_EMAIL", EMAIL);
  vi.stubEnv("NODE_ENV", "production");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/v1/session", () => {
  it("signs in with the right pair and sets the session", async () => {
    const res = await POST(post({ email: EMAIL, key: KEY }));
    expect(res.status).toBe(200);

    const cookie = res.cookies.get(SESSION_COOKIE);
    expect(cookie?.value).toBe(KEY);
    // The three that matter, in the order they matter: unreadable to script,
    // never sent over http, and not carried on a cross-site request.
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.secure).toBe(true);
    expect(cookie?.sameSite).toBe("lax");
  });

  it("refuses the right password under the wrong address", async () => {
    const res = await POST(post({ email: "someone@example.com", key: KEY }));
    expect(res.status).toBe(401);
    expect(res.cookies.get(SESSION_COOKIE)).toBeUndefined();
  });

  it("refuses the right address with the wrong password", async () => {
    const res = await POST(post({ email: EMAIL, key: "not-it" }));
    expect(res.status).toBe(401);
    expect(res.cookies.get(SESSION_COOKIE)).toBeUndefined();
  });

  it("says the same thing either way, so it cannot be asked which half was wrong", async () => {
    const a = await (await POST(post({ email: "nope@example.com", key: KEY }))).json();
    const b = await (await POST(post({ email: EMAIL, key: "nope" }))).json();
    expect(a).toEqual(b);
  });

  it("refuses a form posted from another site", async () => {
    const res = await POST(post({ email: EMAIL, key: KEY }, { origin: "https://evil.example" }));
    expect(res.status).toBe(403);
    expect(res.cookies.get(SESSION_COOKIE)).toBeUndefined();
  });

  it("accepts a request with no Origin, which is curl and the iOS app", async () => {
    const res = await POST(post({ email: EMAIL, key: KEY }, { origin: null }));
    expect(res.status).toBe(200);
  });

  it("says 503 when the deployment has no account configured", async () => {
    vi.stubEnv("OWNER_EMAIL", "");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(post({ email: EMAIL, key: KEY }));
    expect(res.status).toBe(503);
    expect(res.cookies.get(SESSION_COOKIE)).toBeUndefined();
  });

  it("refuses a body that is not JSON", async () => {
    const res = await POST(post("not json at all"));
    expect(res.status).toBe(400);
  });

  it("refuses a body whose fields are the wrong type", async () => {
    const res = await POST(post({ email: 1, key: ["a"] }));
    expect(res.status).toBe(401);
  });

  it("leaves the cookie off https when there is none, so localhost can sign in", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const res = await POST(post({ email: EMAIL, key: KEY }));
    expect(res.cookies.get(SESSION_COOKIE)?.secure).toBe(false);
  });
});

describe("DELETE /api/v1/session", () => {
  it("clears the session", async () => {
    const res = await DELETE();
    expect(res.status).toBe(200);
    // Cleared rather than absent: the browser only drops a cookie it is told
    // to drop, so an empty value with no lifetime is the signing-out.
    const cookie = res.cookies.get(SESSION_COOKIE);
    expect(cookie?.value).toBe("");
    expect(cookie?.maxAge).toBe(0);
  });
});
