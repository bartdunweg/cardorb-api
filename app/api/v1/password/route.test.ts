import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Changing a password, and the parameter that decides whether anybody had to
 * prove they knew the old one.
 *
 * The route's whole job here is which arguments reach `updateUser`, so that is
 * what these assert. Whether a given current password is *correct* is auth-js's
 * question, on Supabase's server; this file is about whether the route gives it
 * the chance to ask. See ADR-0082.
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

vi.mock("../../../../lib/storage/supabase", () => ({
  configured: () => hasDatabase,
  serverClient: async () => (hasDatabase ? { auth: { updateUser } } : null),
}));

vi.mock("../../../../lib/api/viewer", () => ({
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
  updateUser.mockClear();
});

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
    const res = await POST(post({ password: NEW }));
    expect(res.status).toBe(200);
    expect(updateUser).toHaveBeenCalledWith({ password: NEW });
    expect(Object.keys(updateUser.mock.calls[0]![0]!)).toEqual(["password"]);
  });

  it("treats an empty current password as absent rather than as a wrong one", async () => {
    // Supabase would reject "" as incorrect, and the message somebody needs at
    // that point is "fill this in" — which the form's own required field gives
    // them, before this route ever hears about it.
    await POST(post({ password: NEW, currentPassword: "" }));
    expect(updateUser).toHaveBeenCalledWith({ password: NEW });
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

  it("keeps the length floor", async () => {
    const res = await POST(post({ password: "short" }));
    expect(res.status).toBe(400);
    expect(updateUser).not.toHaveBeenCalled();
  });
});
