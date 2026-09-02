import { beforeEach, describe, expect, it, vi } from "vitest";

const authorise = vi.fn();
const renameFolder = vi.fn();
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
  renameFolder: (...a: unknown[]) => renameFolder(...a),
  deleteFolder: (...a: unknown[]) => deleteFolder(...a),
}));
vi.mock("next/cache", () => ({ revalidateTag: (...a: unknown[]) => revalidateTag(...a) }));

const { PATCH, DELETE } = await import("./route");

const ID = "11111111-1111-4111-8111-111111111111";
const FOLDER = { id: ID, name: "Shiny", createdAt: "2026-09-02" };

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
  renameFolder.mockResolvedValue(FOLDER);
  deleteFolder.mockResolvedValue(true);
});

describe("PATCH /api/v1/folders/{id}", () => {
  it("renames the caller's folder", async () => {
    const res = await patch(ID, JSON.stringify({ name: "Shiny" }));
    expect(renameFolder).toHaveBeenCalledWith("me-uuid", ID, "Shiny", "t");
    expect(await res.json()).toEqual({ ok: true, folder: FOLDER });
  });

  it("is a 404 for a folder that is not the caller's, and for an id that is not one", async () => {
    renameFolder.mockResolvedValue(null);
    expect((await patch(ID, JSON.stringify({ name: "x" }))).status).toBe(404);
    expect((await patch("nope", JSON.stringify({ name: "x" }))).status).toBe(404);
    expect(renameFolder).toHaveBeenCalledTimes(1);
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
