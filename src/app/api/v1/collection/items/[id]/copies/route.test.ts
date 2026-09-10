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
  copyRow: (...a: unknown[]) => store(...a),
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

const post = (body: unknown, id = ID) => postRaw(JSON.stringify(body), id);

/** The body exactly as sent, so "no bytes at all" can be one of the cases. */
const postRaw = (body: string, id = ID) =>
  POST(
    new Request(`https://cardorb.com/api/v1/collection/items/${id}/copies`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer t.o.k.e.n" },
      body,
    }),
    { params: Promise.resolve({ id }) },
  );

beforeEach(() => {
  vi.clearAllMocks();
  authoriseWrite.mockResolvedValue(VIEWER);
  store.mockResolvedValue(ROW);
  findFolder.mockResolvedValue({ id: FOLDER, rule: null });
});

describe("POST /api/v1/collection/items/{id}/copies", () => {
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
    store.mockResolvedValue(null);
    expect((await post({ language: "ja" })).status).toBe(404);
  });

  it("takes an identical copy: one more of the same", async () => {
    const res = await post({});
    expect(res.status).toBe(201);
    expect(store).toHaveBeenCalledWith("me-uuid", ID, 1, {}, "t.o.k.e.n");
    expect(await res.json()).toEqual({ ok: true, card: ROW });
  });
});

describe("the empty body the contract promises", () => {
  it("takes no bytes at all as one more identical copy", async () => {
    // `{}` always worked; an empty body did not, because readJsonBody() reached
    // JSON.parse("") and threw — so the one shape the description named as the
    // way to ask for an identical copy was the one shape refused.
    const res = await postRaw("");
    expect(res.status).toBe(201);
    expect(store).toHaveBeenCalledWith("me-uuid", ID, 1, {}, "t.o.k.e.n");
  });

  it("still refuses a body that is malformed rather than absent", async () => {
    // The distinction the empty case must not erase: nothing sent is a copy of
    // the row, half a JSON object is a mistake worth reporting.
    const res = await postRaw("{not json");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid request" });
  });
});
