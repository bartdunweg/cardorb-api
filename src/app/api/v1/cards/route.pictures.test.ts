import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `pictures=0`: the printings' own pictures are not read, and the items carry no `printImage`.
 *
 * The read behind them is one query per catalogue over the page's card ids, which is nothing on a
 * page of forty-eight and 1,191 ms of a 1,442 ms answer when the page is a collection of nineteen
 * hundred copies, as the Pokémon tile on Home asks for. So the test is that the read does not
 * happen, not only that the field is missing: a route that still read them and then dropped the
 * field would pass the second and none of the point.
 */

const authorise = vi.fn();
const getCollection = vi.fn();

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
  getCardPrices: vi.fn(),
  getCollection: (...a: unknown[]) => getCollection(...a),
  findFolder: vi.fn(),
}));
vi.mock("@/lib/storage/collection", () => ({ createRow: vi.fn() }));
vi.mock("@/lib/storage/supabase", () => ({ adminClient: () => ({}) }));

const printPicturesOfCards = vi.fn();
vi.mock("@/lib/storage/postgres", () => ({
  printPicturesOfCards: (...a: unknown[]) => printPicturesOfCards(...a),
  fullArtIdsAmong: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));

const { GET } = await import("./route");

const VIEWER = { userId: "me-uuid", email: "me@example.com", username: "me" };

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
        tcgId: "base1-58",
        owned: true,
        price: null,
        variants: [
          {
            id: "a",
            rarity: null,
            owned: true,
            finish: null,
            quantity: 1,
            condition: null,
            grade: null,
            language: null,
            purchasePrice: null,
            purchaseDate: null,
            notes: null,
            isFavorite: false,
            acquiredAt: null,
            excluded: false,
            collectionId: null,
          },
        ],
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
  getCollection.mockResolvedValue({ sets: SETS, failed: false });
  printPicturesOfCards.mockResolvedValue(new Map());
});

describe("GET /api/v1/cards?pictures=0", () => {
  it("reads the printings' pictures when nothing says otherwise", async () => {
    const body = await (await get("?facets=0")).json();
    expect(printPicturesOfCards).toHaveBeenCalled();
    expect(body.cards[0]).toHaveProperty("printImage");
  });

  it("does not read them, and leaves printImage off, when the caller will not draw them", async () => {
    const body = await (await get("?facets=0&pictures=0")).json();
    expect(printPicturesOfCards).not.toHaveBeenCalled();
    expect(body.cards[0]).not.toHaveProperty("printImage");
    // Everything else about the item is what it was: only the picture is gone.
    expect(body.cards[0]).toMatchObject({ id: "a", name: "Pikachu", set: "Base Set" });
  });
});
