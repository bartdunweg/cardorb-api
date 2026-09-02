import { beforeEach, describe, expect, it, vi } from "vitest";

const authorise = vi.fn();
const getCards = vi.fn();
const getPokedex = vi.fn();

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
vi.mock("@/lib/core/collection/pokedex", () => ({
  getPokedex: (...a: unknown[]) => getPokedex(...a),
}));

const { GET } = await import("./route");

const get = () =>
  GET(
    new Request("https://api.cardorb.com/v1/pokedex", { headers: { authorization: "Bearer t" } }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  authorise.mockResolvedValue({ userId: "me-uuid", email: "me@example.com", username: "me" });
  getCards.mockResolvedValue([]);
  getPokedex.mockReturnValue([{ id: 25, name: "Pikachu", owned: 1, cards: [{ image: "/p.png" }] }]);
});

describe("GET /api/v1/pokedex", () => {
  it("hands back the slots without the cards under them", async () => {
    const body = await (await get()).json();
    expect(getCards).toHaveBeenCalledWith("me-uuid", "t");
    expect(body).toEqual({ entries: [{ id: 25, name: "Pikachu", owned: 1, image: "/p.png" }] });
  });

  it("passes a refusal through", async () => {
    authorise.mockResolvedValue({ status: 401, error: "Who are you?" });
    expect((await get()).status).toBe(401);
  });
});
