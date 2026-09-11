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
const findFolder = vi.fn();
const forgetOnTheWeb = vi.fn(async (_who: { userId: string; username: string }) => undefined);
vi.mock("@/lib/api/web-cache", () => ({
  forgetOnTheWeb: (who: { userId: string; username: string }) => forgetOnTheWeb(who),
}));

// The real guard.ts pulls in lib/api/viewer.ts, which is `import "server-only"`
// — fine under Next's bundler, fatal under plain vitest. Every route test here
// replaces the module wholesale rather than importOriginal()-ing it, the same
// way app/api/v1/profile/route.test.ts replaces lib/api/viewer instead of
// importing the real one.
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
  updateRow: (...a: unknown[]) => updateRow(...a),
  deleteRow: (...a: unknown[]) => deleteRow(...a),
}));
vi.mock("@/lib/core/collection/collection", () => ({
  findFolder: (...a: unknown[]) => findFolder(...a),
}));
vi.mock("next/cache", () => ({ revalidateTag: () => {} }));

const { PATCH, DELETE } = await import("./route");

const VIEWER = { userId: "me-uuid", email: "me@example.com", username: "me" };
const ID = "11111111-1111-1111-1111-111111111111";

/** The row a delete hands back, as the store would: everything a restore needs. */
const REMOVED = {
  id: ID,
  name: "Pikachu",
  number: "25",
  setName: "Base Set",
  rarity: "Common",
  gen: "Base",
  types: ["Lightning"],
  owned: true,
  excluded: false,
  acquiredAt: "2026-01-02T00:00:00.000Z",
  finish: "holo",
  foilPattern: null,
  quantity: 2,
  condition: "NM",
  grade: null,
  language: null,
  purchasePrice: 4.5,
  purchaseDate: "2026-01-02",
  notes: "first pull",
  isFavorite: true,
  collectionId: null,
};

const patch = (body: unknown, id = ID) =>
  PATCH(
    new Request(`https://cardorb.com/api/v1/collection/items/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", authorization: "Bearer t.o.k.e.n" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );

const del = (id = ID) =>
  DELETE(
    new Request(`https://cardorb.com/api/v1/collection/items/${id}`, {
      method: "DELETE",
      headers: { "content-type": "application/json", authorization: "Bearer t.o.k.e.n" },
    }),
    { params: Promise.resolve({ id }) },
  );

const BINDER = "33333333-3333-4333-8333-333333333333";
const KANTO = "44444444-4444-4444-8444-444444444444";

beforeEach(() => {
  authoriseWrite.mockResolvedValue(VIEWER);
  const folders = [
    { id: BINDER, name: "Binder", kind: "manual", rule: null, createdAt: "2026-09-02" },
    {
      id: KANTO,
      name: "Kanto",
      kind: "rule",
      rule: { dex: { from: 1, to: 151 } },
      createdAt: "2026-09-03",
    },
  ];
  findFolder.mockImplementation(
    async (_u: string, id: string) => folders.find((f) => f.id === id) ?? null,
  );
  updateRow.mockResolvedValue({ id: ID, isFavorite: true });
  deleteRow.mockResolvedValue(REMOVED);
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

  it("passes the caller, the id from the path and the bearer token, not anything from the body", async () => {
    // A body naming a different id must change nothing about which row is
    // touched — the path segment is the only id this route trusts, and
    // cards_update only ever lets it reach a row the caller owns anyway.
    await patch({ isFavorite: true, id: "someone-elses-card" });
    expect(updateRow).toHaveBeenCalledWith("me-uuid", ID, { isFavorite: true }, "t.o.k.e.n");
  });

  it("tells the web whose collection changed, once the row is written", async () => {
    await patch({ isFavorite: true });
    expect(forgetOnTheWeb).toHaveBeenCalledWith(expect.objectContaining({ userId: "me-uuid" }));
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

  it("404s a card that is not there or not the caller's", async () => {
    // RLS turns somebody else's row into no row at all; the store hands that
    // back as null and the route must not dress it up as a store failure.
    updateRow.mockResolvedValue(null);
    const res = await patch({ isFavorite: true });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "No such card." });
  });

  it("404s an id that cannot be a row, before asking the store", async () => {
    const res = await patch({ isFavorite: true }, "not-a-uuid");
    expect(res.status).toBe(404);
    expect(updateRow).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/v1/collection/items/{id} filing", () => {
  it("files a copy in a folder filled by hand", async () => {
    updateRow.mockResolvedValue({ id: ID, collectionId: BINDER });
    const res = await patch({ collectionId: BINDER });
    expect(res.status).toBe(200);
    expect(updateRow).toHaveBeenCalledWith("me-uuid", ID, { collectionId: BINDER }, "t.o.k.e.n");
  });

  it("refuses a rule folder, and a folder that is not the caller's", async () => {
    const ruled = await patch({ collectionId: KANTO });
    expect(ruled.status).toBe(400);
    expect(await ruled.json()).toEqual({
      error: "That folder fills itself from a rule. Cards cannot be filed in it.",
    });
    const unknown = await patch({ collectionId: "55555555-5555-4555-8555-555555555555" });
    expect(unknown.status).toBe(404);
    expect(updateRow).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/v1/cards/[id]", () => {
  it("refuses when authorisation refuses", async () => {
    authoriseWrite.mockResolvedValue({ status: 401, error: "Sign in to see this." });
    const res = await del();
    expect(res.status).toBe(401);
    expect(deleteRow).not.toHaveBeenCalled();
  });

  it("deletes by the path id, as the caller, with the caller's own token", async () => {
    const res = await del();
    expect(res.status).toBe(200);
    expect(deleteRow).toHaveBeenCalledWith("me-uuid", ID, "t.o.k.e.n");
  });

  it("hands back the row it removed, in the `card` the PATCH above answers with", async () => {
    // The only moment this row can be read: it is gone, and nothing here
    // remembers it. A client offering an undo keeps what comes back and posts
    // it to POST /v1/cards, acquiredAt among the fields, which is the whole
    // reason that create takes one.
    const res = await del();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, card: REMOVED });
  });

  it("404s when nothing went, rather than claiming it did", async () => {
    deleteRow.mockResolvedValue(null);
    const res = await del();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "No such card." });
  });

  it("404s an id that cannot be a row, before asking the store", async () => {
    const res = await del("not-a-uuid");
    expect(res.status).toBe(404);
    expect(deleteRow).not.toHaveBeenCalled();
  });
});
