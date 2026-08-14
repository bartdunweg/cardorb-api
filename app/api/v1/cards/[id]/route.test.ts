import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * One printing, changed or removed — and the two things worth being paranoid
 * about, the same two POST /v1/cards already is: a caller cannot act on
 * somebody else's row by naming its id, and a bearer-token caller (curl, the
 * iOS app) is authorised the same way a cookie-bearing browser is.
 */

const authoriseWrite = vi.fn();
const updateRow = vi.fn();
const deleteRow = vi.fn();

// The real guard.ts pulls in lib/api/viewer.ts, which is `import "server-only"`
// — fine under Next's bundler, fatal under plain vitest. Every route test here
// replaces the module wholesale rather than importOriginal()-ing it, the same
// way app/api/v1/profile/route.test.ts replaces lib/api/viewer instead of
// importing the real one.
vi.mock("../../../../../lib/api/guard", () => ({
  authoriseWrite: (...a: unknown[]) => authoriseWrite(...a),
  refused: (r: { status?: number }) => "status" in r,
  readHeaders: () => ({}),
  storeErrorResponse: (err: unknown) => Response.json({ error: (err as Error).message }, { status: 502 }),
}));
vi.mock("../../../../../lib/api/viewer", () => ({ bearer: (req: Request) => req.headers.get("authorization")?.replace(/^Bearer /, "") ?? null }));
vi.mock("../../../../../lib/storage/collection", () => ({
  updateRow: (...a: unknown[]) => updateRow(...a),
  deleteRow: (...a: unknown[]) => deleteRow(...a),
}));
vi.mock("next/cache", () => ({ revalidateTag: () => {} }));

const { PATCH, DELETE } = await import("./route");

const VIEWER = { userId: "me-uuid", email: "me@example.com", username: "me" };
const params = Promise.resolve({ id: "card-1" });

const patch = (body: unknown) =>
  PATCH(
    new Request("https://cardorb.com/api/v1/cards/card-1", {
      method: "PATCH",
      headers: { "content-type": "application/json", authorization: "Bearer t.o.k.e.n" },
      body: JSON.stringify(body),
    }),
    { params },
  );

const del = () =>
  DELETE(
    new Request("https://cardorb.com/api/v1/cards/card-1", {
      method: "DELETE",
      headers: { "content-type": "application/json", authorization: "Bearer t.o.k.e.n" },
    }),
    { params },
  );

beforeEach(() => {
  authoriseWrite.mockResolvedValue(VIEWER);
  updateRow.mockResolvedValue({ id: "card-1", isFavorite: true });
  deleteRow.mockResolvedValue(undefined);
});
afterEach(() => {
  updateRow.mockClear();
  deleteRow.mockClear();
});

describe("PATCH /api/v1/cards/[id]", () => {
  it("refuses when authorisation refuses", async () => {
    authoriseWrite.mockResolvedValue({ status: 401, error: "Sign in to see this." });
    const res = await patch({ isFavorite: true });
    expect(res.status).toBe(401);
    expect(updateRow).not.toHaveBeenCalled();
  });

  it("passes the id from the path and the bearer token, not anything from the body", async () => {
    // A body naming a different id must change nothing about which row is
    // touched — the path segment is the only id this route trusts, and
    // cards_update only ever lets it reach a row the caller owns anyway.
    await patch({ isFavorite: true, id: "someone-elses-card" });
    expect(updateRow).toHaveBeenCalledWith("card-1", { isFavorite: true }, "t.o.k.e.n");
  });

  it("refuses a body with nothing recognisable in it", async () => {
    const res = await patch({ nonsense: true });
    expect(res.status).toBe(400);
    expect(updateRow).not.toHaveBeenCalled();
  });

  it("refuses a quantity of zero", async () => {
    const res = await patch({ quantity: 0 });
    expect(res.status).toBe(400);
    expect(updateRow).not.toHaveBeenCalled();
  });

  it("turns a store failure into the response the guard would give it", async () => {
    updateRow.mockRejectedValue(new Error("That card could not be updated: no rows"));
    const res = await patch({ isFavorite: true });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe("DELETE /api/v1/cards/[id]", () => {
  it("refuses when authorisation refuses", async () => {
    authoriseWrite.mockResolvedValue({ status: 401, error: "Sign in to see this." });
    const res = await del();
    expect(res.status).toBe(401);
    expect(deleteRow).not.toHaveBeenCalled();
  });

  it("deletes by the path id with the caller's own token", async () => {
    const res = await del();
    expect(res.status).toBe(200);
    expect(deleteRow).toHaveBeenCalledWith("card-1", "t.o.k.e.n");
  });
});
