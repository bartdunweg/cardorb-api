import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Changing a password, and the parameter that decides whether anybody had to
 * prove they knew the old one.
 *
 * Two jobs, and both are asserted here: which arguments reach `updateUser`, and
 * which callers are made to supply one in the first place. Whether a given
 * current password is *correct* is auth-js's question, on Supabase's server;
 * this file is about whether the route gives it the chance to ask — and about
 * the requests that must never get as far as asking, because the session on
 * them never proved a password and the JSON alone said so.
 *
 * Supabase is mocked at the module, the same way session/route.test.ts does it.
 */

/**
 * server-only throws on import outside a React Server Component, which is the
 * whole point of it: lib/storage/supabase.ts must never reach a browser bundle.
 * A test is neither, so it is stubbed away here rather than removed from the
 * module it is guarding.
 */
vi.mock("server-only", () => ({}));

let updateFails: string | null = null;
/**
 * Typed with the argument it actually receives, not as `() => …`. A zero-arg
 * mock makes `updateUser.mock.calls[0]` an empty tuple, so the assertion that
 * matters most here — *which keys were sent* — will not even compile.
 */
const updateUser = vi.fn(async (_attrs: { password: string; current_password?: string }) =>
  updateFails ? { error: { message: updateFails } } : { error: null },
);
let hasDatabase = true;
let signedIn = true;
/**
 * The `amr` on the session's access token, which is what decides whether a
 * current password has to be supplied. `password` is the signed-in browser;
 * a recovery arrival never proved one. Set to null for a token that carries no
 * amr at all, which the route must read as the stricter of the two.
 */
let amr: unknown = [{ method: "password", timestamp: 1 }];
const getClaims = vi.fn(async () => ({
  data: { claims: { sub: "u1", ...(amr === null ? {} : { amr }) } },
  error: null,
}));

vi.mock("@/lib/storage/supabase", () => ({
  configured: () => hasDatabase,
  serverClient: async () => (hasDatabase ? { auth: { updateUser, getClaims } } : null),
}));

vi.mock("@/lib/api/viewer", () => ({
  currentViewer: async () => (signedIn ? { id: "u1", email: "owner@example.com" } : null),
}));

const { POST } = await import("./route");

function post(body: unknown, opts: { origin?: string | null; ip?: string } = {}) {
  const h = new Headers({ "content-type": "application/json" });
  if (opts.origin !== null) h.set("origin", opts.origin ?? "https://cardorb.example");
  h.set("host", "cardorb.example");
  // A distinct address per call unless one is given: the limiter has memory and
  // one test must not spend another's budget.
  h.set("x-real-ip", opts.ip ?? `10.2.0.${Math.floor(Math.random() * 200) + 1}`);
  return new Request("https://cardorb.example/api/v1/password", {
    method: "POST",
    headers: h,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const NEW = "a-brand-new-password";

beforeEach(() => {
  updateFails = null;
  hasDatabase = true;
  signedIn = true;
  amr = [{ method: "password", timestamp: 1 }];
  updateUser.mockClear();
  getClaims.mockClear();
});

/** A session that came from a reset link: it never proved a password. */
const fromRecovery = () => {
  amr = [{ method: "recovery", timestamp: 1 }];
};

describe("POST /api/v1/password", () => {
  it("passes the current password on when the form asked for one", async () => {
    const res = await POST(post({ password: NEW, currentPassword: "the-old-one" }));
    expect(res.status).toBe(200);
    expect(updateUser).toHaveBeenCalledWith({
      password: NEW,
      current_password: "the-old-one",
    });
  });

  it("sends no current_password key at all on the recovery path", async () => {
    // Not `current_password: undefined`. Sending the key with no value is a
    // different request from not sending the key, and only one of them leaves
    // somebody who followed a recovery link able to finish.
    fromRecovery();
    const res = await POST(post({ password: NEW }));
    expect(res.status).toBe(200);
    expect(updateUser).toHaveBeenCalledWith({ password: NEW });
    expect(Object.keys(updateUser.mock.calls[0]![0]!)).toEqual(["password"]);
  });

  it("refuses a signed-in session that simply left the field out", async () => {
    // The whole attack this route exists to stop: the borrowed unlocked browser
    // holds a session, and until this check the JSON decided whether anybody had
    // to know the old password. Omitting the field is not a recovery arrival,
    // and only the token can say which of the two is asking.
    const res = await POST(post({ password: NEW }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Enter your current password." });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("refuses a session whose token says nothing about how it was made", async () => {
    // Unreadable is not recovery. The cost of being wrong the other way is the
    // account, so an absent amr is read as the signed-in case.
    amr = null;
    const res = await POST(post({ password: NEW }));
    expect(res.status).toBe(400);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("treats an empty current password as absent rather than as a wrong one", async () => {
    // Supabase would reject "" as incorrect, and the message somebody needs at
    // that point is "fill this in" — which the form's own required field gives
    // them, before this route ever hears about it.
    fromRecovery();
    await POST(post({ password: NEW, currentPassword: "" }));
    expect(updateUser).toHaveBeenCalledWith({ password: NEW });
  });

  it("does not let an empty string past the requirement either", async () => {
    const res = await POST(post({ password: NEW, currentPassword: "" }));
    expect(res.status).toBe(400);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("says plainly when the current password is wrong", async () => {
    updateFails = "Invalid credentials: current password is incorrect";
    const res = await POST(post({ password: NEW, currentPassword: "not-it" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "That is not your current password." });
  });

  it("does not mistake a wrong current password for a reused new one", async () => {
    // Supabase's wording for the first can contain "new password", which is the
    // string the reuse branch below matches on. Order decides it, and this is
    // the test that would fail if somebody reordered the two branches.
    updateFails = "New password: current password is incorrect";
    const res = await POST(post({ password: NEW, currentPassword: "not-it" }));
    expect(await res.json()).toEqual({ error: "That is not your current password." });
  });

  it("still translates a reused password", async () => {
    updateFails = "New password should be different from the old password";
    const res = await POST(post({ password: NEW, currentPassword: "the-old-one" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "That is already your password. Pick a different one.",
    });
  });

  it("refuses a cross-origin attempt before it looks at anything", async () => {
    const res = await POST(post({ password: NEW }, { origin: "https://evil.example" }));
    expect(res.status).toBe(403);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("refuses an anonymous caller", async () => {
    signedIn = false;
    const res = await POST(post({ password: NEW }));
    expect(res.status).toBe(401);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("reads amr in its plain-string shape too", async () => {
    // RFC-8176 says an array of names; Supabase sends entries with a timestamp.
    // Both are allowed by the claim and the route must not pass one of them
    // through as "no password was proved".
    amr = ["password"];
    expect((await POST(post({ password: NEW }))).status).toBe(400);
    amr = ["recovery"];
    expect((await POST(post({ password: NEW }))).status).toBe(200);
  });

  it("keeps the length floor", async () => {
    const res = await POST(post({ password: "short" }));
    expect(res.status).toBe(400);
    expect(updateUser).not.toHaveBeenCalled();
  });
});
