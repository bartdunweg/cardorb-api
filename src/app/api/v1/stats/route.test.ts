import { beforeEach, describe, expect, it, vi } from "vitest";

const authorise = vi.fn();
const getCollection = vi.fn();

vi.mock("@/lib/api/guard", () => ({
  authorise: (...a: unknown[]) => authorise(...a),
  refused: (r: { status?: number }) => "status" in r,
  readHeaders: () => ({}),
}));
vi.mock("@/lib/api/viewer", () => ({
  bearer: (req: Request) => req.headers.get("authorization")?.replace(/^Bearer /, "") ?? null,
}));
vi.mock("@/lib/core/collection/collection", () => ({
  getCollection: (...a: unknown[]) => getCollection(...a),
}));

const { GET } = await import("./route");

const get = () =>
  GET(new Request("https://api.cardorb.com/v1/stats", { headers: { authorization: "Bearer t" } }));

beforeEach(() => {
  vi.clearAllMocks();
  authorise.mockResolvedValue({ userId: "me-uuid", email: "me@example.com", username: "me" });
  getCollection.mockResolvedValue({ sets: [], failed: false });
});

describe("GET /api/v1/stats", () => {
  it("counts the caller's own collection", async () => {
    const res = await get();
    expect(getCollection).toHaveBeenCalledWith("me-uuid", "t");
    expect(await res.json()).toEqual({
      stats: { cards: 0, copies: 0, wishlist: 0, favorites: 0, sets: 0, value: 0, unpriced: 0 },
    });
  });

  it("is a 503 nothing caches when the collection could not be built", async () => {
    getCollection.mockResolvedValue({ sets: [], failed: true });
    const res = await get();
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("passes a refusal through", async () => {
    authorise.mockResolvedValue({ status: 401, error: "Who are you?" });
    expect((await get()).status).toBe(401);
  });
});
