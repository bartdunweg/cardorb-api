import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authorise = vi.fn();
const catalogueIndex = vi.fn();
vi.mock("@/lib/api/guard", () => ({
  authorise: (...a: unknown[]) => authorise(...a),
  refused: (r: { status?: number }) => "status" in r,
  readHeaders: () => ({ "Cache-Control": "private, no-store" }),
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
});
