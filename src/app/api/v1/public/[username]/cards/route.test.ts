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
  language: null,
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
  ownerOf.mockResolvedValue({ id: "owner-1", username: "bart", displayName: null, avatarUrl: null, wishlistPublic: false, favoritesPublic: false, pokedexPublic: false, pokedex: null });
  getPublicCollection.mockResolvedValue({ sets: SETS, failed: false });
});

describe("GET /api/v1/public/{username}/cards", () => {
  it("lists owned cards with a copy count and nothing private", async () => {
    const body = await (await get()).json();
    expect(body.total).toBe(1);
    // One row, two copies: the line under the name says two.
    expect(body.copies).toBe(2);
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
      imageHigh: "/hi.png",
      speciesId: null,
      tcgId: null,
      copies: 2,
      localName: null,
      favorite: false,
    });
  });

  it("pages and searches, and refuses a query it cannot mean", async () => {
    expect((await (await get("?q=pika&limit=1")).json()).total).toBe(1);
    expect((await get("?limit=0")).status).toBe(400);
  });

  it("is cached at the CDN for a minute, and not served while stale", async () => {
    const res = await get();
    expect(res.headers.get("cache-control")).toBe("public, max-age=0, s-maxage=60");
  });

  it("tells a flooding address when to come back", async () => {
    // The limiter is per process and keyed by address; a distinct address
    // keeps this test's budget its own.
    const flood = () =>
      GET(
        new Request("https://api.cardorb.com/v1/public/bart/cards", {
          headers: { "x-real-ip": "10.7.7.7" },
        }),
        { params: Promise.resolve({ username: "bart" }) },
      );
    for (let i = 0; i < 60; i++) await flood();
    const res = await flood();
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    expect(await res.json()).toEqual({ error: "Too many requests" });
  });

  it("is a 503 nothing caches when the read failed, and a 404 for no such profile", async () => {
    getPublicCollection.mockResolvedValue({ sets: [], failed: true });
    const res = await get();
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("no-store");
    ownerOf.mockResolvedValue(null);
    expect((await get("", "nobody")).status).toBe(404);
  });

  it("shows the favorites and the Pokédex only for an owner who does, and refuses another list", async () => {
    expect((await get("?list=favorites")).status).toBe(404);
    expect((await get("?list=pokedex")).status).toBe(404);
    expect((await get("?list=binder")).status).toBe(400);
    ownerOf.mockResolvedValue({ id: "owner-1", username: "bart", displayName: null, avatarUrl: null, wishlistPublic: false, favoritesPublic: true, pokedexPublic: true, pokedex: null });
    const favorites = await (await get("?list=favorites")).json();
    expect(favorites.cards.length).toBeGreaterThan(0);
    expect(favorites.cards.every((c: { favorite: boolean }) => c.favorite)).toBe(true);
    const all = await (await get()).json();
    const dex = await (await get("?list=pokedex")).json();
    expect(dex.total).toBe(all.total);
  });
});
