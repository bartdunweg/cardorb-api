import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authorise = vi.fn();
const mirrorCards = vi.fn();
const getRows = vi.fn();
const guidePricesFor = vi.fn(async (..._a: unknown[]): Promise<Map<string, unknown>> => new Map());
vi.mock("@/lib/api/guard", () => ({
  authorise: (...a: unknown[]) => authorise(...a),
  refused: (r: { status?: number }) => "status" in r,
  readHeaders: () => ({}),
}));
vi.mock("@/lib/core/catalogue/mirror", () => ({
  mirrorCards: (...a: unknown[]) => mirrorCards(...a),
}));
vi.mock("@/lib/core/catalogue/tcgdex-browse", () => ({
  englishSets: async () => [{ id: "base1", name: "Base" }],
}));
vi.mock("@/lib/core/collection/collection", () => ({
  getRows: (...a: unknown[]) => getRows(...a),
  guidePricesFor: (...a: unknown[]) => guidePricesFor(...a),
}));
vi.mock("@/lib/api/viewer", () => ({ bearer: () => null }));
vi.mock("@/lib/storage/supabase", () => ({ adminClient: () => ({}) }));

const { GET } = await import("./route");
const get = (ids?: string) =>
  GET(
    new Request(
      `https://api.cardorb.com/api/v1/catalog/cards${ids === undefined ? "" : `?ids=${ids}`}`,
    ),
  );

const hit = {
  id: "base1-4",
  number: "4",
  name: "Charizard",
  localName: null,
  setName: "Base",
  image: null,
  imageHigh: null,
  rarity: "Rare Holo",
  types: ["Fire"],
  series: "Base",
  tcgId: "base1-4",
};

beforeEach(() => {
  authorise.mockResolvedValue({ userId: "me", email: "me@example.com", username: "me" });
  mirrorCards.mockResolvedValue([hit]);
  getRows.mockResolvedValue({ rows: [], failed: false });
});
afterEach(() => {
  vi.clearAllMocks();
  guidePricesFor.mockImplementation(async () => new Map());
});

describe("GET /api/v1/catalog/cards", () => {
  it("refuses when authorisation refuses", async () => {
    authorise.mockResolvedValue({ status: 401, error: "Sign in to see this." });
    expect((await get("base1-4")).status).toBe(401);
  });

  it("wants one to fifty ids", async () => {
    expect((await get()).status).toBe(400);
    expect((await get("")).status).toBe(400);
    expect((await get(Array.from({ length: 51 }, (_, i) => `x-${i}`).join(","))).status).toBe(400);
  });

  it("answers the cards with the viewer's marks and the guide's price, asking the copy once per id", async () => {
    guidePricesFor.mockImplementation(
      async (...a: unknown[]) =>
        new Map((a[0] as string[]).map((id) => [id, { price: { market: 12.5 }, holo: null }])),
    );
    const res = await get("base1-4,base1-4,%20base1-5");
    expect(res.status).toBe(200);
    expect(mirrorCards).toHaveBeenCalledWith({}, ["base1-4", "base1-5"]);
    const { cards } = await res.json();
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      id: "base1-4",
      owned: false,
      wishlist: false,
      quantity: 0,
      price: { market: 12.5 },
      priceHolo: null,
    });
  });

  it("marks a card the viewer holds", async () => {
    getRows.mockResolvedValue({
      rows: [
        {
          id: "row-1",
          name: "Charizard",
          number: "004",
          setName: "Base",
          rarity: null,
          gen: null,
          types: [],
          owned: true,
          excluded: false,
          acquiredAt: null,
          quantity: 2,
          condition: null,
          grade: null,
          language: null,
          purchasePrice: null,
          purchaseDate: null,
          notes: null,
          isFavorite: false,
        },
      ],
      failed: false,
    });
    const { cards } = await (await get("base1-4")).json();
    expect(cards[0]).toMatchObject({ owned: true, quantity: 2, itemIds: ["row-1"] });
  });
});
