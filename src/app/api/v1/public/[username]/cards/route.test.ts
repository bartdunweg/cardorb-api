import { beforeEach, describe, expect, it, vi } from "vitest";

const ownerOf = vi.fn();
const getPublicCollection = vi.fn();

vi.mock("@/lib/core/collection/collection", () => ({
  ownerOf: (...a: unknown[]) => ownerOf(...a),
  getPublicCollection: (...a: unknown[]) => getPublicCollection(...a),
}));

const { GET } = await import("./route");

const variant = (id: string, owned = true) => ({
  id,
  rarity: "Common",
  owned,
  finish: null,
  quantity: 1,
  condition: null,
  grade: null,
  purchasePrice: 12,
  purchaseDate: null,
  notes: "private",
  isFavorite: true,
  acquiredAt: null,
  excluded: false,
  collectionId: "f",
});
const card = (name: string, variants: ReturnType<typeof variant>[]) => ({
  key: name,
  name,
  number: "1",
  type: null,
  gen: null,
  image: `/${name}.png`,
  imageHigh: "/hi.png",
  imageSize: null,
  speciesId: null,
  variants,
  owned: true,
  price: { market: 9 },
  priceHolo: null,
  tcgId: null,
});
const SETS = [
  {
    name: "Base Set",
    title: "Base Set",
    logo: null,
    logoSize: null,
    releaseDate: null,
    total: null,
    cards: [card("Pikachu", [variant("a"), variant("b")]), card("Mew", [variant("c", false)])],
  },
];

const get = (qs = "", name = "bart") =>
  GET(new Request(`https://api.cardorb.com/v1/public/${name}/cards${qs}`), {
    params: Promise.resolve({ username: name }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  ownerOf.mockResolvedValue({ id: "owner-1", username: "bart", displayName: null, avatarUrl: null });
  getPublicCollection.mockResolvedValue({ sets: SETS, failed: false });
});

describe("GET /api/v1/public/{username}/cards", () => {
  it("lists owned cards with a copy count and nothing private", async () => {
    const body = await (await get()).json();
    expect(body.total).toBe(1);
    expect(body.cards[0]).toEqual({
      key: "Pikachu",
      name: "Pikachu",
      number: "1",
      set: "Base Set",
      setTitle: "Base Set",
      rarity: "Common",
      gen: null,
      type: null,
      image: "/Pikachu.png",
      speciesId: null,
      tcgId: null,
      copies: 2,
    });
  });

  it("pages and searches, and refuses a query it cannot mean", async () => {
    expect((await (await get("?q=pika&limit=1")).json()).total).toBe(1);
    expect((await get("?limit=0")).status).toBe(400);
  });

  it("is a 503 nothing caches when the read failed, and a 404 for no such profile", async () => {
    getPublicCollection.mockResolvedValue({ sets: [], failed: true });
    const res = await get();
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("no-store");
    ownerOf.mockResolvedValue(null);
    expect((await get("", "nobody")).status).toBe(404);
  });
});
