import { beforeEach, describe, expect, it, vi } from "vitest";

const authorise = vi.fn();
const getCards = vi.fn();

vi.mock("@/lib/api/guard", () => ({
  authorise: (...a: unknown[]) => authorise(...a),
  refused: (r: { status?: number }) => "status" in r,
  readHeaders: () => ({}),
}));
vi.mock("@/lib/api/viewer", () => ({
  bearer: (req: Request) => req.headers.get("authorization")?.replace(/^Bearer /, "") ?? null,
}));
vi.mock("@/lib/core/collection/collection", () => ({
  getCards: (...a: unknown[]) => getCards(...a),
}));

const { GET } = await import("./route");

const get = () =>
  GET(new Request("https://api.cardorb.com/v1/stats", { headers: { authorization: "Bearer t" } }));

beforeEach(() => {
  vi.clearAllMocks();
  authorise.mockResolvedValue({ userId: "me-uuid", email: "me@example.com", username: "me" });
  getCards.mockResolvedValue([]);
});

describe("GET /api/v1/stats", () => {
  it("counts the caller's own collection", async () => {
    const res = await get();
    expect(getCards).toHaveBeenCalledWith("me-uuid", "t");
    expect(await res.json()).toEqual({
      stats: { cards: 0, copies: 0, wishlist: 0, favorites: 0, sets: 0 },
    });
  });

  it("passes a refusal through", async () => {
    authorise.mockResolvedValue({ status: 401, error: "Who are you?" });
    expect((await get()).status).toBe(401);
  });
});
