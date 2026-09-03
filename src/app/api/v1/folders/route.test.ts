import { beforeEach, describe, expect, it, vi } from "vitest";

const authorise = vi.fn();
const listFolders = vi.fn();
const createFolder = vi.fn();
const getRows = vi.fn();

vi.mock("@/lib/api/guard", () => ({
  authorise: (...a: unknown[]) => authorise(...a),
  authoriseWrite: (...a: unknown[]) => authorise(...a),
  refused: (r: { status?: number }) => "status" in r,
  readHeaders: () => ({}),
  storeErrorResponse: () => new Response(null, { status: 503 }),
}));
vi.mock("@/lib/api/viewer", () => ({
  bearer: (req: Request) => req.headers.get("authorization")?.replace(/^Bearer /, "") ?? null,
}));
vi.mock("@/lib/core/collection/collection", () => ({
  getRows: (...a: unknown[]) => getRows(...a),
}));
vi.mock("@/lib/storage/collection", () => ({
  listFolders: (...a: unknown[]) => listFolders(...a),
  createFolder: (...a: unknown[]) => createFolder(...a),
}));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));

const { GET, POST } = await import("./route");

const FOLDER = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Binder",
  createdAt: "2026-09-02",
};

const get = () =>
  GET(
    new Request("https://api.cardorb.com/v1/folders", { headers: { authorization: "Bearer t" } }),
  );
const post = (body: string) =>
  POST(
    new Request("https://api.cardorb.com/v1/folders", {
      method: "POST",
      headers: { authorization: "Bearer t", "content-type": "application/json" },
      body,
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  authorise.mockResolvedValue({ userId: "me-uuid", email: "me@example.com", username: "me" });
  listFolders.mockResolvedValue([FOLDER]);
  getRows.mockResolvedValue({
    rows: [
      { id: "a", owned: true, collectionId: FOLDER.id },
      { id: "b", owned: false, collectionId: FOLDER.id },
      { id: "c", owned: true, collectionId: null },
    ],
    failed: false,
  });
  createFolder.mockResolvedValue(FOLDER);
});

describe("GET /api/v1/folders", () => {
  it("lists the caller's folders with how many owned copies sit in each", async () => {
    const body = await (await get()).json();
    expect(listFolders).toHaveBeenCalledWith("me-uuid", "t");
    expect(body).toEqual({ folders: [{ ...FOLDER, count: 1 }] });
  });

  it("still lists the folders when the rows could not be read, and says so", async () => {
    getRows.mockResolvedValue({ rows: [], failed: true });
    const body = await (await get()).json();
    /* Without this every folder reads `count: 0` during a store outage, which
       is the same answer as an empty binder. */
    expect(body).toEqual({ folders: [{ ...FOLDER, count: 0 }], collectionUnavailable: true });
  });
});

describe("POST /api/v1/folders", () => {
  it("creates a folder with a trimmed name", async () => {
    const res = await post(JSON.stringify({ name: "  Binder   two " }));
    expect(createFolder).toHaveBeenCalledWith("me-uuid", "Binder two", "t");
    expect(await res.json()).toEqual({ ok: true, folder: { ...FOLDER, count: 0 } });
  });

  it("refuses a nameless folder", async () => {
    const res = await post(JSON.stringify({ name: "   " }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "A folder needs a name." });
    expect(createFolder).not.toHaveBeenCalled();
  });

  it("refuses a body that is not JSON", async () => {
    expect((await post("{nope")).status).toBe(400);
  });
});
