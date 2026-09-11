import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The same change to many copies at once: the ids are checked before the store is asked,
 * the caller and the token go with them, and a list that matches none of the caller's rows
 * is the single route's 404 rather than an empty success.
 */

const authoriseWrite = vi.fn();
const updateRows = vi.fn();
const findFolder = vi.fn();
const forgetOnTheWeb = vi.fn(async (_who: { userId: string; username: string }) => undefined);
vi.mock("@/lib/api/web-cache", () => ({
  forgetOnTheWeb: (who: { userId: string; username: string }) => forgetOnTheWeb(who),
}));
vi.mock("@/lib/api/guard", () => ({
  authoriseWrite: (...a: unknown[]) => authoriseWrite(...a),
  refused: (r: { status?: number }) => "status" in r,
  readHeaders: () => ({}),
  storeErrorResponse: (err: unknown) =>
    Response.json({ error: (err as Error).message }, { status: 502 }),
}));
vi.mock("@/lib/api/viewer", () => ({
  bearer: (req: Request) => req.headers.get("authorization")?.replace(/^Bearer /, "") ?? null,
}));
vi.mock("@/lib/storage/collection", () => ({
  updateRows: (...a: unknown[]) => updateRows(...a),
}));
vi.mock("@/lib/core/collection/collection", () => ({
  findFolder: (...a: unknown[]) => findFolder(...a),
}));
vi.mock("next/cache", () => ({ revalidateTag: () => {} }));

const { PATCH } = await import("./route");

const VIEWER = { userId: "me-uuid", email: "me@example.com", username: "me" };
const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";
const BINDER = "33333333-3333-4333-8333-333333333333";
const KANTO = "44444444-4444-4444-8444-444444444444";

const patch = (body: unknown) =>
  PATCH(
    new Request("https://cardorb.com/api/v1/collection/items", {
      method: "PATCH",
      headers: { "content-type": "application/json", authorization: "Bearer t.o.k.e.n" },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  authoriseWrite.mockResolvedValue(VIEWER);
  findFolder.mockImplementation(async (_u: string, id: string) =>
    id === BINDER
      ? { id: BINDER, name: "Binder", kind: "manual", rule: null }
      : id === KANTO
        ? { id: KANTO, name: "Kanto", kind: "rule", rule: { dex: { from: 1, to: 151 } } }
        : null,
  );
  updateRows.mockResolvedValue([{ id: A, condition: "Near Mint" }]);
});
afterEach(() => updateRows.mockClear());

describe("PATCH /api/v1/collection/items", () => {
  it("refuses when authorisation refuses", async () => {
    authoriseWrite.mockResolvedValue({ status: 401, error: "Sign in to see this." });
    expect((await patch({ ids: [A], condition: "Near Mint" })).status).toBe(401);
    expect(updateRows).not.toHaveBeenCalled();
  });

  it("passes the caller, the ids and the bearer token, with the patch alone", async () => {
    const res = await patch({ ids: [A, B], condition: "Near Mint" });
    expect(res.status).toBe(200);
    expect(updateRows).toHaveBeenCalledWith(
      "me-uuid",
      [A, B],
      { condition: "Near Mint" },
      "t.o.k.e.n",
    );
    expect(await res.json()).toEqual({ ok: true, cards: [{ id: A, condition: "Near Mint" }] });
    expect(forgetOnTheWeb).toHaveBeenCalledWith(expect.objectContaining({ userId: "me-uuid" }));
  });

  it("refuses ids that are missing, empty, not row ids, repeated or too many", async () => {
    for (const ids of [
      undefined,
      [],
      ["not-a-uuid"],
      [A, A],
      Array.from({ length: 101 }, () => A),
    ]) {
      const res = await patch({ ids, condition: "Near Mint" });
      expect(res.status, JSON.stringify(ids)?.slice(0, 40)).toBe(400);
    }
    expect(updateRows).not.toHaveBeenCalled();
  });

  it("checks the patch the way the single route does", async () => {
    expect((await patch({ ids: [A], quantity: 0 })).status).toBe(400);
    expect((await patch({ ids: [A], nonsense: true })).status).toBe(400);
    expect((await patch({ ids: [A], collectionId: KANTO })).status).toBe(400);
    expect(
      (await patch({ ids: [A], collectionId: "55555555-5555-4555-8555-555555555555" })).status,
    ).toBe(404);
    expect(updateRows).not.toHaveBeenCalled();
  });

  it("404s when none of the ids is a row of the caller's", async () => {
    updateRows.mockResolvedValue([]);
    const res = await patch({ ids: [A, B], condition: "Near Mint" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "No such card." });
  });

  it("turns a store failure into the response the guard would give it", async () => {
    updateRows.mockRejectedValue(new Error("Those cards could not be updated: no rows"));
    expect((await patch({ ids: [A], condition: "Near Mint" })).status).toBe(502);
  });
});
