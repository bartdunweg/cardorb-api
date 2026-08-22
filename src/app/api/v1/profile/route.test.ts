import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The switch that turns on a feature, and the body that must not be trusted.
 *
 * is_public is the highest-value setting in the app: it defaults to false, and
 * until this route existed nothing set it, so /user/<name> was unreachable for
 * every account whose row had not been edited by hand. Everything behind it —
 * the profile lookup, stripPrices, the OG image — was already built.
 *
 * The assertions worth having are about what the route refuses. A PATCH body is
 * somebody else's input: it must not be able to name a different user, and a
 * field it does not mention must survive untouched, because the screen saves
 * each control on its own.
 */

const requestViewer = vi.fn();
const updateProfile = vi.fn();
const ownProfile = vi.fn();

vi.mock("@/lib/api/viewer", () => ({
  requestViewer: (req: Request) => requestViewer(req),
  bearer: (req: Request) => req.headers.get("authorization")?.replace(/^Bearer /, "") ?? null,
}));
vi.mock("@/lib/storage/supabase", () => ({
  serverClient: async () => ({}),
  userClient: () => ({}),
}));
vi.mock("@/lib/storage/postgres", () => ({
  updateProfile: (...a: unknown[]) => updateProfile(...a),
  ownProfile: (...a: unknown[]) => ownProfile(...a),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { PATCH } = await import("./route");

const VIEWER = { userId: "me-uuid", email: "me@example.com", username: "me" };

const patch = (body: unknown, origin = "https://cardorb.com") =>
  PATCH(
    new Request("https://cardorb.com/api/v1/profile", {
      method: "PATCH",
      headers: { origin, host: "cardorb.com", "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  requestViewer.mockResolvedValue(VIEWER);
  updateProfile.mockResolvedValue(undefined);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
});
afterEach(() => {
  vi.unstubAllEnvs();
  updateProfile.mockClear();
});

describe("PATCH /api/v1/profile", () => {
  it("refuses a cross-origin request before anything else", async () => {
    const res = await patch({ isPublic: true }, "https://elsewhere.example");
    expect(res.status).toBe(403);
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("refuses when nobody is signed in", async () => {
    requestViewer.mockResolvedValue(null);
    expect((await patch({ isPublic: true })).status).toBe(401);
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("saves for a bearer caller — the iOS app, which has no cookie at all", async () => {
    // requestViewer() replaced currentViewer() precisely so this works: a
    // cookie-only lookup refused every bearer-token request regardless of how
    // good the token was.
    const res = await PATCH(
      new Request("https://cardorb.com/api/v1/profile", {
        method: "PATCH",
        headers: {
          host: "cardorb.com",
          "content-type": "application/json",
          authorization: "Bearer t.o.k.e.n",
        },
        body: JSON.stringify({ isPublic: true }),
      }),
    );
    expect(res.status).toBe(200);
    expect(requestViewer).toHaveBeenCalled();
    expect(updateProfile).toHaveBeenCalledWith({}, "me-uuid", { isPublic: true });
  });

  it("saves the switch for the signed-in person and nobody else", async () => {
    // The id comes from the verified session. A body naming somebody else must
    // change nothing about who is written to — this is the one assertion that
    // would catch a refactor threading the wrong argument.
    await patch({ isPublic: true, id: "someone-else", user_id: "someone-else" });
    expect(updateProfile).toHaveBeenCalledWith({}, "me-uuid", { isPublic: true });
  });

  it("leaves a field alone when the body does not mention it", async () => {
    // Each control on the screen saves independently, so a PATCH about the
    // display name must not clear is_public back to its default.
    await patch({ displayName: "Bart" });
    expect(updateProfile).toHaveBeenCalledWith({}, "me-uuid", { displayName: "Bart" });
  });

  it("turns an emptied display name into a null rather than an empty string", async () => {
    // The public page falls back on null; "" would render a heading with
    // nothing in it.
    await patch({ displayName: "   " });
    expect(updateProfile).toHaveBeenCalledWith({}, "me-uuid", { displayName: null });
  });

  it("refuses a display name past the column's limit", async () => {
    const res = await patch({ displayName: "x".repeat(61) });
    expect(res.status).toBe(400);
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("refuses a switch that is not a boolean", async () => {
    const res = await patch({ isPublic: "yes" });
    expect(res.status).toBe(400);
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("stamps the welcome flow as done", async () => {
    await patch({ onboarded: true });
    const [, , written] = updateProfile.mock.calls[0] as [
      unknown,
      string,
      { onboardedAt?: string },
    ];
    expect(typeof written.onboardedAt).toBe("string");
    expect(Number.isNaN(Date.parse(written.onboardedAt as string))).toBe(false);
  });

  it("takes the time from the server rather than from the body", async () => {
    // A client-supplied timestamp is a client-supplied fact about when an
    // account was set up. There is no reason to accept one and one obvious
    // reason not to.
    await patch({ onboarded: true, onboardedAt: "1999-01-01T00:00:00.000Z" });
    const [, , written] = updateProfile.mock.calls[0] as [
      unknown,
      string,
      { onboardedAt?: string },
    ];
    expect(written.onboardedAt).not.toBe("1999-01-01T00:00:00.000Z");
  });

  it("never un-onboards an account", async () => {
    // One way only: nothing in the app puts somebody back in front of the
    // welcome flow, so `false` is not an instruction, it is nothing to do.
    const res = await patch({ onboarded: false });
    expect(res.status).toBe(400);
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("refuses a body with nothing in it rather than writing an empty update", async () => {
    const res = await patch({ nothing: "here" });
    expect(res.status).toBe(400);
    expect(updateProfile).not.toHaveBeenCalled();
  });
});
