import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authorise = vi.fn();
const catalogueIndex = vi.fn();
vi.mock("@/lib/api/guard", () => ({
  authorise: (...a: unknown[]) => authorise(...a),
  /* One mock behind both doors, as the search route's tests do it. The route asks
     authoriseOpen() since the catalogue opened, and every test written against authorise()
     still says what it said: a viewer, a refusal, or now null for a reader who offered no
     credential at all. */
  authoriseOpen: (...a: unknown[]) => authorise(...a),
  refused: (r: { status?: number }) => "status" in r,
  /* Distinguishable on purpose: the point of two header sets is which answer carries which,
     and `{}` for both is what let a cacheable refusal past review on the shelf route. The
     capital spelling is the route's own, so neither set can end up beside it as a second key. */
  readHeaders: () => ({ "Cache-Control": "private, no-store" }),
  openReadHeaders: () => ({ "Cache-Control": "public, max-age=0, s-maxage=60" }),
}));
vi.mock("@/lib/core/catalogue/mirror", () => ({ catalogueIndex: () => catalogueIndex() }));
vi.mock("@/lib/storage/supabase", () => ({ adminClient: () => ({}) }));

const { GET } = await import("./route");
const get = (headers: Record<string, string> = {}) =>
  GET(new Request("https://api.cardorb.com/api/v1/catalog/index", { headers }));

beforeEach(() => {
  authorise.mockResolvedValue({ userId: "me", email: "me@example.com", username: "me" });
  catalogueIndex.mockResolvedValue({
    version: "2026-09-11T19:10:00Z",
    body: '{"version":"x","sets":{},"cards":[]}',
  });
});
afterEach(() => vi.clearAllMocks());

describe("GET /api/v1/catalog/index", () => {
  it("refuses when authorisation refuses", async () => {
    authorise.mockResolvedValue({ status: 401, error: "Sign in to see this." });
    expect((await get()).status).toBe(401);
    expect(catalogueIndex).not.toHaveBeenCalled();
  });

  it("serves the document under its version, kept but revalidated, and private", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("etag")).toBe('"2026-09-11T19:10:00Z"');
    // Asked about on every load rather than believed for a day: a correction to the copy
    // reaches a browser that already has the document, at the cost of one 304.
    expect(res.headers.get("cache-control")).toBe("private, no-cache");
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(await res.json()).toEqual({ version: "x", sets: {}, cards: [] });
  });

  it("answers 304 and no body to a caller holding the current version", async () => {
    const res = await get({ "if-none-match": '"2026-09-11T19:10:00Z"' });
    expect(res.status).toBe(304);
    expect(await res.text()).toBe("");
  });

  it("answers 404 before the first copy", async () => {
    catalogueIndex.mockResolvedValue(null);
    expect((await get()).status).toBe(404);
  });

  /* A card's name is the same for everybody, and the command palette searches this document in
     the browser before anyone has signed in. Nothing on it is the reader's, so the only thing
     that changes for a reader who offered nothing is who may hold the answer. */
  describe("without a credential", () => {
    beforeEach(() => {
      authorise.mockResolvedValue(null);
    });

    it("answers the document to a reader who offered nothing", async () => {
      const res = await get();
      expect(res.status).toBe(200);
      expect(res.headers.get("etag")).toBe('"2026-09-11T19:10:00Z"');
      expect(await res.json()).toEqual({ version: "x", sets: {}, cards: [] });
    });

    it("carries nothing of any reader's", async () => {
      const body = await (await get()).json();
      expect(Object.keys(body).sort()).toEqual(["cards", "sets", "version"]);
      expect(body).not.toHaveProperty("owned");
      expect(body).not.toHaveProperty("quantity");
    });

    it("answers with the open window, which a shared cache may hold", async () => {
      const res = await get();
      expect(res.headers.get("cache-control")).toBe("public, max-age=0, s-maxage=60");
    });

    it("still answers 304 and no body to a reader holding the current version", async () => {
      const res = await get({ "if-none-match": '"2026-09-11T19:10:00Z"' });
      expect(res.status).toBe(304);
      expect(await res.text()).toBe("");
    });

    /* A refusal is nobody's to hold: sent with the open window, one bad minute would be stored
       by the shared cache and handed to every signed-out visitor until it expired. */
    it("sends a refusal private, not with the open window", async () => {
      authorise.mockResolvedValue({ status: 401, error: "Sign in to see this." });
      const res = await get();
      expect(res.status).toBe(401);
      expect(res.headers.get("cache-control")).toBe("private, no-store");
    });

    it("sends the 404 before the first copy private too", async () => {
      catalogueIndex.mockResolvedValue(null);
      const res = await get();
      expect(res.status).toBe(404);
      expect(res.headers.get("cache-control")).toBe("private, no-store");
    });
  });
});
