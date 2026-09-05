import { beforeEach, describe, expect, it, vi } from "vitest";

const authorise = vi.fn();
const getFolder = vi.fn();
const updateFolder = vi.fn();
const deleteFolder = vi.fn();
const revalidateTag = vi.fn();

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
vi.mock("@/lib/storage/collection", () => ({
  getFolder: (...a: unknown[]) => getFolder(...a),
  updateFolder: (...a: unknown[]) => updateFolder(...a),
  deleteFolder: (...a: unknown[]) => deleteFolder(...a),
}));
vi.mock("next/cache", () => ({ revalidateTag: (...a: unknown[]) => revalidateTag(...a) }));

const { PATCH, DELETE } = await import("./route");

const ID = "11111111-1111-4111-8111-111111111111";
const FOLDER = { id: ID, name: "Shiny", kind: "manual", rule: null, createdAt: "2026-09-02" };
const RULED = { ...FOLDER, kind: "rule", rule: { dex: { from: 1, to: 151 } } };

const patch = (id: string, body: string) =>
  PATCH(
    new Request(`https://api.cardorb.com/v1/folders/${id}`, {
      method: "PATCH",
      headers: { authorization: "Bearer t", "content-type": "application/json" },
      body,
    }),
    { params: Promise.resolve({ id }) },
  );
const del = (id: string) =>
  DELETE(
    new Request(`https://api.cardorb.com/v1/folders/${id}`, {
      method: "DELETE",
      headers: { authorization: "Bearer t" },
    }),
    { params: Promise.resolve({ id }) },
  );

beforeEach(() => {
  vi.clearAllMocks();
  authorise.mockResolvedValue({ userId: "me-uuid", email: "me@example.com", username: "me" });
  getFolder.mockResolvedValue(FOLDER);
  updateFolder.mockResolvedValue(FOLDER);
  deleteFolder.mockResolvedValue(true);
});

describe("PATCH /api/v1/folders/{id}", () => {
  it("renames the caller's folder", async () => {
    const res = await patch(ID, JSON.stringify({ name: "Shiny" }));
    expect(updateFolder).toHaveBeenCalledWith("me-uuid", ID, { name: "Shiny" }, "t");
    expect(await res.json()).toEqual({ ok: true, folder: FOLDER });
  });

  it("changes a rule folder's rule, and refuses to give one to a folder filled by hand", async () => {
    getFolder.mockResolvedValue(RULED);
    updateFolder.mockResolvedValue({ ...RULED, rule: { dex: { from: 152, to: 251 } } });
    const res = await patch(ID, JSON.stringify({ rule: { dex: { from: 152, to: 251 } } }));
    expect(updateFolder).toHaveBeenCalledWith(
      "me-uuid",
      ID,
      { rule: { dex: { from: 152, to: 251 } } },
      "t",
    );
    expect(res.status).toBe(200);

    getFolder.mockResolvedValue(FOLDER);
    const refused = await patch(ID, JSON.stringify({ rule: { dex: { from: 1, to: 9 } } }));
    expect(refused.status).toBe(400);
    expect(await refused.json()).toEqual({
      error: "This folder is filled by hand; it cannot take a rule.",
    });
    expect(updateFolder).toHaveBeenCalledTimes(1);
  });

  it("never lets a rule folder lose its rule, and wants something to change", async () => {
    expect((await patch(ID, JSON.stringify({ rule: null }))).status).toBe(400);
    expect((await patch(ID, JSON.stringify({}))).status).toBe(400);
    expect(updateFolder).not.toHaveBeenCalled();
  });

  it("is a 404 for a folder that is not the caller's, and for an id that is not one", async () => {
    getFolder.mockResolvedValue(null);
    expect((await patch(ID, JSON.stringify({ name: "x" }))).status).toBe(404);
    expect((await patch("nope", JSON.stringify({ name: "x" }))).status).toBe(404);
    expect(getFolder).toHaveBeenCalledTimes(1);
    expect(updateFolder).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/v1/folders/{id}", () => {
  it("deletes and drops the cached rows, because the cards in it moved out", async () => {
    const res = await del(ID);
    expect(deleteFolder).toHaveBeenCalledWith("me-uuid", ID, "t");
    expect(await res.json()).toEqual({ ok: true });
    expect(revalidateTag).toHaveBeenCalledWith("cards:me-uuid", { expire: 0 });
  });

  it("is a 404 when nothing was deleted", async () => {
    deleteFolder.mockResolvedValue(false);
    expect((await del(ID)).status).toBe(404);
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});
