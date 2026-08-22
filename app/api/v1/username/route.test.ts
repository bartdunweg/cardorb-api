import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Who may claim a name, and on whose connection.
 *
 * The route had no test at all, which is how it kept a cookie-only viewer
 * lookup long after a second client existed. The assertions worth having are
 * about the two things that were wrong rather than about the happy path the
 * browser already exercises: a bearer token must be accepted, and the claim
 * must go out on that token's own connection.
 *
 * That second one cannot be caught by checking the status code — claiming
 * through the wrong client fails inside Postgres, where auth.uid() is null,
 * and a mocked storage layer would happily answer ok. So the client identity
 * is asserted directly: userClient(token) returns a marked object and the test
 * checks that *that* is what reached claimUsername.
 */

const requestViewer = vi.fn();
const claimUsername = vi.fn();

const COOKIE_DB = { via: "cookies" };
const tokenDb = (token: string) => ({ via: "bearer", token });

vi.mock("@/lib/api/viewer", () => ({
  requestViewer: (req: Request) => requestViewer(req),
  bearer: (req: Request) => req.headers.get("authorization")?.replace(/^Bearer /, "") ?? null,
}));
vi.mock("@/lib/storage/supabase", () => ({
  serverClient: async () => COOKIE_DB,
  userClient: (token: string) => tokenDb(token),
}));
vi.mock("@/lib/storage/postgres", () => ({
  claimUsername: (...a: unknown[]) => claimUsername(...a),
}));

const { POST } = await import("./route");

const VIEWER = { userId: "me-uuid", email: "me@example.com", username: "me" };

/** No Origin header is the iOS app; a matching one is the site's own form. */
const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new Request("https://cardorb.com/api/v1/username", {
      method: "POST",
      headers: { host: "cardorb.com", "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  requestViewer.mockResolvedValue(VIEWER);
  claimUsername.mockResolvedValue({ ok: true });
});

describe("POST /v1/username", () => {
  it("accepts a bearer token, where it used to answer Sign in first", async () => {
    const res = await post({ username: "newname" }, { authorization: "Bearer tok-123" });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, username: "newname" });
  });

  it("claims on the token's own connection, not the cookie-bound one", async () => {
    await post({ username: "newname" }, { authorization: "Bearer tok-123" });

    // auth.uid() comes from the connection, and claim_username raises without
    // it. Passing COOKIE_DB here would be the bug this route shipped with.
    expect(claimUsername).toHaveBeenCalledWith(tokenDb("tok-123"), "newname");
  });

  it("still uses cookies when no token is offered", async () => {
    await post({ username: "newname" });

    expect(claimUsername).toHaveBeenCalledWith(COOKIE_DB, "newname");
  });

  it("refuses a caller it cannot name", async () => {
    requestViewer.mockResolvedValue(null);

    const res = await post({ username: "newname" }, { authorization: "Bearer nope" });

    expect(res.status).toBe(401);
    expect(claimUsername).not.toHaveBeenCalled();
  });

  it("refuses a cross-site form post", async () => {
    const res = await post({ username: "newname" }, { origin: "https://evil.example" });

    expect(res.status).toBe(403);
    expect(claimUsername).not.toHaveBeenCalled();
  });

  it("answers the current name without touching the database", async () => {
    const res = await post({ username: "me" }, { authorization: "Bearer tok-123" });

    expect(res.status).toBe(200);
    expect(claimUsername).not.toHaveBeenCalled();
  });

  it("keeps the two refusals apart", async () => {
    claimUsername.mockResolvedValue({ ok: false, reason: "reserved" });
    const reserved = await post({ username: "settings" }, { authorization: "Bearer tok-123" });
    expect(reserved.status).toBe(409);
    await expect(reserved.json()).resolves.toEqual({ error: "That name is not available." });

    claimUsername.mockResolvedValue({ ok: false, reason: "taken" });
    const taken = await post({ username: "someone" }, { authorization: "Bearer tok-123" });
    expect(taken.status).toBe(409);
    await expect(taken.json()).resolves.toEqual({ error: "That name is taken." });
  });
});
