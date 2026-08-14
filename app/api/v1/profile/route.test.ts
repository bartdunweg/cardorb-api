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

const currentViewer = vi.fn();
const updateProfile = vi.fn();
const ownProfile = vi.fn();

vi.mock("../../../../lib/api/viewer", () => ({ currentViewer: () => currentViewer() }));
vi.mock("../../../../lib/storage/supabase", () => ({ serverClient: async () => ({}) }));
vi.mock("../../../../lib/storage/postgres", () => ({
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
  currentViewer.mockResolvedValue(VIEWER);
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
    currentViewer.mockResolvedValue(null);
    expect((await patch({ isPublic: true })).status).toBe(401);
    expect(updateProfile).not.toHaveBeenCalled();
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

  it("refuses a body with nothing in it rather than writing an empty update", async () => {
    const res = await patch({ nothing: "here" });
    expect(res.status).toBe(400);
    expect(updateProfile).not.toHaveBeenCalled();
  });
});
