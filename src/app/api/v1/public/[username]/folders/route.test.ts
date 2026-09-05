import { beforeEach, describe, expect, it, vi } from "vitest";

const ownerOf = vi.fn();
const getPublicFolders = vi.fn();
const getPublicCollection = vi.fn();
vi.mock("@/lib/core/collection/collection", () => ({
  ownerOf: (...a: unknown[]) => ownerOf(...a),
  getPublicFolders: (...a: unknown[]) => getPublicFolders(...a),
  getPublicCollection: (...a: unknown[]) => getPublicCollection(...a),
}));

const { GET } = await import("./route");

const get = (name = "bart") =>
  GET(new Request(`https://api.cardorb.com/v1/public/${name}/folders`), {
    params: Promise.resolve({ username: name }),
  });

/** One set with one card held as two copies, one of them filed in folder "f1"; a second card filed nowhere. */
const variant = (over: Record<string, unknown>) => ({
  id: "v",
  rarity: null,
  owned: true,
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
  ...over,
});
const sets = [
  {
    name: "Base",
    title: "Base Set",
    logo: null,
    logoSize: null,
    releaseDate: "1999-01-09",
    total: 102,
    cards: [
      {
        key: "Base-088",
        name: "Pikachu",
        number: "088",
        type: null,
        gen: null,
        image: null,
        imageHigh: null,
        imageSize: null,
        speciesId: 25,
        price: null,
        priceHolo: null,
        tcgId: "base1-088",
        owned: true,
        variants: [variant({ id: "a", collectionId: "f1" }), variant({ id: "b", collectionId: "f1" })],
      },
      {
        key: "Base-004",
        name: "Charizard",
        number: "004",
        type: null,
        gen: null,
        image: null,
        imageHigh: null,
        imageSize: null,
        speciesId: 6,
        price: null,
        priceHolo: null,
        tcgId: "base1-004",
        owned: true,
        variants: [variant({ id: "c" })],
      },
    ],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  ownerOf.mockResolvedValue({ id: "u", username: "bart", displayName: "Bart", avatarUrl: null });
  getPublicCollection.mockResolvedValue({ sets, failed: false });
});

describe("GET /api/v1/public/{username}/folders", () => {
  it("lists the public folders with how many cards each holds, one per card", async () => {
    getPublicFolders.mockResolvedValue([
      { id: "f1", name: "Kanto", kind: "manual", rule: null, pokedex: null, isPublic: true, createdAt: "" },
      { id: "f2", name: "Starters", kind: "rule", rule: { dex: { from: 1, to: 9 } }, pokedex: null, isPublic: true, createdAt: "" },
    ]);
    const res = await get();
    expect(await res.json()).toEqual({
      folders: [
        { id: "f1", name: "Kanto", kind: "manual", count: 1 },
        { id: "f2", name: "Starters", kind: "rule", count: 1 },
      ],
    });
    expect(res.headers.get("cache-control")).toBe("public, max-age=0, s-maxage=60");
  });

  it("answers an empty list without reading the collection", async () => {
    getPublicFolders.mockResolvedValue([]);
    const res = await get();
    expect(await res.json()).toEqual({ folders: [] });
    expect(getPublicCollection).not.toHaveBeenCalled();
  });

  it("is a 404 for a profile that is not public", async () => {
    ownerOf.mockResolvedValue(null);
    expect((await get("nobody")).status).toBe(404);
    expect(getPublicFolders).not.toHaveBeenCalled();
  });
});
