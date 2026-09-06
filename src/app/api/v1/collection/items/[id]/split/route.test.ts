import { beforeEach, describe, expect, it, vi } from "vitest";

const authoriseWrite = vi.fn();
const store = vi.fn();
const findFolder = vi.fn();

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
  splitRow: (...a: unknown[]) => store(...a),
}));
vi.mock("@/lib/core/collection/collection", () => ({
  findFolder: (...a: unknown[]) => findFolder(...a),
}));
vi.mock("next/cache", () => ({ revalidateTag: () => {} }));

const { POST } = await import("./route");

const VIEWER = { userId: "me-uuid", email: "me@example.com", username: "me" };
const ID = "11111111-1111-1111-1111-111111111111";
const FOLDER = "22222222-2222-4222-8222-222222222222";
const ROW = { id: "row-2", name: "Pikachu", quantity: 1 };

const post = (body: unknown, id = ID) =>
  POST(
    new Request(`https://cardorb.com/api/v1/collection/items/${id}/split`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer t.o.k.e.n" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );

beforeEach(() => {
  vi.clearAllMocks();
  authoriseWrite.mockResolvedValue(VIEWER);
  store.mockResolvedValue({ kind: "ok", copy: ROW, source: { ...ROW, id: "row-1", quantity: 2 } });
  findFolder.mockResolvedValue({ id: FOLDER, rule: null });
});

describe("POST /api/v1/collection/items/{id}/split", () => {
  it("refuses a caller the guard refuses, before the store", async () => {
    authoriseWrite.mockResolvedValue({ status: 401, error: "No.", headers: {} });
    expect((await post({ language: "ja" })).status).toBe(401);
    expect(store).not.toHaveBeenCalled();
  });

  it("is a 404 for an id that is no id, without a store call", async () => {
    expect((await post({ language: "ja" }, "nope")).status).toBe(404);
    expect(store).not.toHaveBeenCalled();
  });

  it("hands the store the caller, the row, the count and the changes, with the credential", async () => {
    const res = await post({ language: "ja", count: 2 });
    expect(res.status).toBe(201);
    expect(store).toHaveBeenCalledWith("me-uuid", ID, 2, { language: "ja" }, "t.o.k.e.n");
  });

  it("refuses a key a copy cannot differ in", async () => {
    const res = await post({ quantity: 3 });
    expect(res.status).toBe(400);
    expect(store).not.toHaveBeenCalled();
  });

  it("refuses a rule folder and misses an unknown one", async () => {
    findFolder.mockResolvedValue({ id: FOLDER, rule: { sets: ["x"] } });
    expect((await post({ collectionId: FOLDER })).status).toBe(400);
    findFolder.mockResolvedValue(null);
    expect((await post({ collectionId: FOLDER })).status).toBe(404);
    expect(store).not.toHaveBeenCalled();
  });

  it("is a 404 when the row is not the caller's", async () => {
    store.mockResolvedValue({ kind: "missing" });
    expect((await post({ language: "ja" })).status).toBe(404);
  });

  it("refuses a split of identical copies", async () => {
    const res = await post({ count: 1 });
    expect(res.status).toBe(400);
    expect(store).not.toHaveBeenCalled();
  });

  it("is a 400 when the count is every copy, and answers both rows otherwise", async () => {
    store.mockResolvedValue({ kind: "too-many" });
    expect((await post({ language: "ja", count: 3 })).status).toBe(400);
    store.mockResolvedValue({
      kind: "ok",
      copy: ROW,
      source: { ...ROW, id: "row-1", quantity: 2 },
    });
    const res = await post({ language: "ja" });
    expect(await res.json()).toEqual({
      ok: true,
      card: ROW,
      source: { ...ROW, id: "row-1", quantity: 2 },
    });
  });
});
