import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The flat list: whose, which page, and that a bad query is refused rather
 * than guessed at. The filtering itself is tested in lib/core/collection/items.test.ts.
 */

const authorise = vi.fn();
const getCards = vi.fn();

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
  getCards: (...a: unknown[]) => getCards(...a),
}));
vi.mock("@/lib/storage/collection", () => ({ createRow: vi.fn() }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));

const { GET } = await import("./route");

const VIEWER = { userId: "me-uuid", email: "me@example.com", username: "me" };

const variant = (id: string, owned = true) => ({
  id,
  rarity: null,
  owned,
  finish: null,
  quantity: 1,
  condition: null,
  grade: null,
  purchasePrice: null,
  purchaseDate: null,
  notes: null,
  isFavorite: false,
  acquiredAt: null,
  excluded: false,
  collectionId: null,
});

const SETS = [
  {
    name: "Base Set",
    title: "Base Set",
    logo: null,
    logoSize: null,
    releaseDate: null,
    total: null,
    cards: [
      {
        key: "pika",
        name: "Pikachu",
        number: "58",
        type: null,
        gen: null,
        image: null,
        imageHigh: null,
        imageSize: null,
        speciesId: 25,
        variants: [variant("a"), variant("b", false)],
        owned: true,
        price: null,
        priceHolo: null,
        tcgId: null,
      },
    ],
  },
];

const get = (qs = "") =>
  GET(
    new Request(`https://api.cardorb.com/v1/cards${qs}`, {
      headers: { authorization: "Bearer t.o.k.e.n" },
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  authorise.mockResolvedValue(VIEWER);
  getCards.mockResolvedValue(SETS);
});

describe("GET /api/v1/cards", () => {
  it("reads the caller's own collection with the caller's own credential", async () => {
    await get();
    expect(getCards).toHaveBeenCalledWith("me-uuid", "t.o.k.e.n");
  });

  it("answers one page of copies and the total behind it", async () => {
    const body = await (await get("?owned=true")).json();
    expect(body.total).toBe(1);
    expect(body.cards).toHaveLength(1);
    expect(body.cards[0]).toMatchObject({ id: "a", name: "Pikachu", set: "Base Set", owned: true });
  });

  it("refuses a query it would have to guess at", async () => {
    const res = await get("?owned=maybe");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "owned must be true or false." });
    expect(getCards).not.toHaveBeenCalled();
  });

  it("passes a refusal through", async () => {
    authorise.mockResolvedValue({ status: 401, error: "Who are you?" });
    const res = await get();
    expect(res.status).toBe(401);
    expect(getCards).not.toHaveBeenCalled();
  });
});
