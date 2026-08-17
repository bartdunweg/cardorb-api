import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Signing in, and the one thing this endpoint now has that it spent its whole
 * life arguing against: a rate limit.
 *
 * The argument used to be sound. A limiter here "would lock the owner out of
 * their own tool after ten typos, on a key that is a long random string rather
 * than something guessable by hand" — true of one shared passcode, and exactly
 * backwards once passwords are chosen by people and there is more than one
 * account to lock out of. The tests below are mostly about that inversion.
 *
 * Supabase is mocked at the module. Whether a password is right is auth-js's
 * question; this file is about what the route does with the answer.
 */

/**
 * server-only throws on import outside a React Server Component, which is the
 * whole point of it: lib/storage/supabase.ts must never reach a browser bundle.
 * A test is neither, so it is stubbed away here rather than removed from the
 * module it is guarding.
 */
vi.mock("server-only", () => ({}));

let signInFails = false;
const signIn = vi.fn(async () =>
  signInFails ? { error: { message: "Invalid" } } : { error: null },
);
const signOut = vi.fn(async () => ({ error: null }));
let hasDatabase = true;

vi.mock("../../../../lib/storage/supabase", () => ({
  configured: () => hasDatabase,
  serverClient: async () =>
    hasDatabase ? { auth: { signInWithPassword: signIn, signOut } } : null,
}));

const { POST, DELETE } = await import("./route");

/** A sign-in attempt from the app's own origin unless told otherwise. */
function post(body: unknown, opts: { origin?: string | null; host?: string; ip?: string } = {}) {
  const h = new Headers({ "content-type": "application/json" });
  if (opts.origin !== null) h.set("origin", opts.origin ?? "https://cardorb.example");
  h.set("host", opts.host ?? "cardorb.example");
  // A distinct address per call unless one is given: the limiter has memory and
  // one test must not spend another's budget.
  h.set("x-real-ip", opts.ip ?? `10.1.0.${Math.floor(Math.random() * 200) + 1}`);
  return new Request("https://cardorb.example/api/v1/session", {
    method: "POST",
    headers: h,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const good = { email: "owner@example.com", password: "a-real-password" };

beforeEach(() => {
  signInFails = false;
  hasDatabase = true;
  signIn.mockClear();
  signOut.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/v1/session", () => {
  it("signs in with the right credentials", async () => {
    const res = await POST(post(good));
    expect(res.status).toBe(200);
    expect(signIn).toHaveBeenCalledWith({ email: good.email, password: good.password });
  });

  it("refuses a cross-origin attempt before it looks at anything", async () => {
    const res = await POST(post(good, { origin: "https://evil.example" }));
    expect(res.status).toBe(403);
    expect(signIn).not.toHaveBeenCalled();
  });

  it("refuses wrong credentials with 401 and says nothing about which half", async () => {
    // "No account with that address" is a way to ask whether an address has an
    // account here, one guess at a time.
    signInFails = true;
    const res = await POST(post(good));
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/email or password/i);
    expect(body.error).not.toMatch(/account|exist|unknown/i);
  });

  it("says 503 when there is no database, rather than blaming the caller", async () => {
    hasDatabase = false;
    const res = await POST(post(good));
    expect(res.status).toBe(503);
  });

  it("refuses a body that is not JSON", async () => {
    const res = await POST(post("not json at all"));
    expect(res.status).toBe(400);
  });

  it("survives fields that are not strings", async () => {
    const res = await POST(post({ email: 42, password: null }));
    expect(res.status).toBeLessThan(500);
  });

  it("still accepts the old field name, so a client mid-update can sign in", async () => {
    await POST(post({ email: good.email, key: "a-real-password" }));
    expect(signIn).toHaveBeenCalledWith({ email: good.email, password: "a-real-password" });
  });

  it("stops a flood from one address", async () => {
    // The inversion. This is the test the old comment argued should not exist.
    signInFails = true;
    const ip = "10.5.5.5";
    for (let i = 0; i < 20; i++) await POST(post(good, { ip }));
    const res = await POST(post(good, { ip }));
    expect(res.status).toBe(429);
  });

  it("stops a slow walk through one account's likely passwords", async () => {
    // Under the per-address limit, so the first limiter never sees it. This is
    // the patient attack, and it is the reason there are two limiters.
    signInFails = true;
    const ip = "10.5.5.6";
    for (let i = 0; i < 5; i++) await POST(post(good, { ip }));
    const res = await POST(post(good, { ip }));
    expect(res.status).toBe(429);
  });

  it("does not tell a stranger which accounts exist by rate limiting them differently", async () => {
    // A 429 that only ever happened for real accounts would be an oracle.
    signInFails = true;
    const ip = "10.5.5.7";
    const nobody = { email: "nobody@example.com", password: "x" };
    for (let i = 0; i < 5; i++) await POST(post(nobody, { ip }));
    const res = await POST(post(nobody, { ip }));
    expect(res.status).toBe(429);
  });

  it("does not let one address spend another's budget", async () => {
    signInFails = true;
    for (let i = 0; i < 6; i++) await POST(post(good, { ip: "10.5.5.8" }));
    signInFails = false;
    const res = await POST(post(good, { ip: "10.5.5.9" }));
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/v1/session", () => {
  it("signs out", async () => {
    const res = await DELETE();
    expect(res.status).toBe(200);
    expect(signOut).toHaveBeenCalled();
  });

  it("says it worked when there is no database, because the caller ends up signed out either way", async () => {
    hasDatabase = false;
    const res = await DELETE();
    expect(res.status).toBe(200);
  });
});
