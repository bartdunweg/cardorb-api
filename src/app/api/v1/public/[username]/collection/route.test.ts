import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A public collection is read for a stranger, and a failed read is a 503 that
 * nothing caches — not an empty collection the CDN hands out for an hour.
 *
 * It is also read against the owner's `wishlistPublic` flag. The fixture below
 * set that flag to false from the day it was written and never asserted on it,
 * so the whole time this route ignored it the test said everything was fine.
 */
const ownerOf = vi.fn();
const getPublicCollection = vi.fn();

vi.mock("@/lib/core/collection/collection", () => ({
  ownerOf: (...a: unknown[]) => ownerOf(...a),
  getPublicCollection: (...a: unknown[]) => getPublicCollection(...a),
}));

const { GET } = await import("./route");

const variant = (owned: boolean) => ({
  id: "v",
  rarity: "Common",
  owned,
  finish: null,
  foilPattern: null,
  quantity: 1,
  condition: null,
  grade: null,
  language: null,
  purchasePrice: 12,
  purchaseDate: null,
  notes: "private",
  isFavorite: false,
  acquiredAt: null,
  excluded: false,
  collectionId: null,
});
const card = (name: string, owned: boolean) => ({
  key: name,
  name,
  number: "1",
  type: null,
  gen: null,
  image: `/${name}.png`,
  imageHigh: "/hi.png",
  imageSize: null,
  speciesId: null,
  variants: [variant(owned)],
  owned,
  price: { market: 9 },
  priceHolo: null,
  tcgId: null,
});
const set = (name: string, cards: ReturnType<typeof card>[]) => ({
  name,
  title: name,
  abbreviation: null,
  logo: null,
  logoSize: null,
  releaseDate: null,
  total: null,
  cards,
});
/** One set holding a card and a wish, and one set that is wishes only. */
const SETS = [
  set("Base Set", [card("Pikachu", true), card("Mew", false)]),
  set("Jungle", [card("Scyther", false)]),
];
const namesIn = async (res: Response) =>
  ((await res.json()) as { sets: { name: string; cards: { name: string }[] }[] }).sets.map(
    (s) => `${s.name}: ${s.cards.map((c) => c.name).join(",")}`,
  );

const get = (name = "bart") =>
  GET(new Request(`https://api.cardorb.com/v1/public/${name}/collection`), {
    params: Promise.resolve({ username: name }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  ownerOf.mockResolvedValue({ id: "owner-1", username: "bart", displayName: null, avatarUrl: null, wishlistPublic: false, favoritesPublic: false, pokedexPublic: false, pokedex: null });
  getPublicCollection.mockResolvedValue({ sets: [], failed: false });
});

describe("GET /api/v1/public/{username}/collection", () => {
  it("reads the owner's collection as a public one and caches the answer", async () => {
    const res = await get();
    expect(getPublicCollection).toHaveBeenCalledWith("owner-1");
    expect(res.status).toBe(200);
    // A minute at the CDN and no serving while stale: turning a profile
    // private is only as quick as this window, since nothing purges the host.
    expect(res.headers.get("cache-control")).toBe("public, max-age=0, s-maxage=60");
    expect(await res.json()).toEqual({ sets: [] });
  });

  it("answers a failed walk with a 503 that nothing may cache", async () => {
    getPublicCollection.mockResolvedValue({ sets: [], failed: true });
    const res = await get();
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toMatchObject({ error: expect.any(String) });
  });

  it("is a 404 for a profile that is not public", async () => {
    ownerOf.mockResolvedValue(null);
    expect((await get("nobody")).status).toBe(404);
    expect(getPublicCollection).not.toHaveBeenCalled();
  });

  it("keeps the wishlist back from an owner who does not show one", async () => {
    // A card with no owned variant is a wish. This route sent them whatever the
    // flag said, which is a list of everything somebody is looking for, from an
    // unkeyed route, for a profile that never offered it.
    getPublicCollection.mockResolvedValue({ sets: SETS, failed: false });
    const res = await get();
    expect(res.status).toBe(200);
    // Mew goes, and Jungle goes with it: a set left empty is the shape of what
    // was removed, not a set in the collection.
    expect(await namesIn(res)).toEqual(["Base Set: Pikachu"]);
  });

  it("shows the wishlist for an owner who does", async () => {
    ownerOf.mockResolvedValue({
      id: "owner-1",
      username: "bart",
      displayName: null,
      avatarUrl: null,
      wishlistPublic: true,
      favoritesPublic: false,
      pokedexPublic: false,
      pokedex: null,
    });
    getPublicCollection.mockResolvedValue({ sets: SETS, failed: false });
    expect(await namesIn(await get())).toEqual(["Base Set: Pikachu,Mew", "Jungle: Scyther"]);
  });
});
