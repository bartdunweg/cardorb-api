import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A public collection is read for a stranger, and a failed read is a 503 that
 * nothing caches — not an empty collection the CDN hands out for an hour.
 *
 * It is also read against the owner's `wishlistPublic` flag. The fixture below
 * set that flag to false from the day it was written and never asserted on it,
 * so the whole time this route ignored it the test said everything was fine.
 *
 * And the same shape once more, on the thing that matters most here. Every
 * assertion in this file used to be about which cards come back — names, sets,
 * statuses — over a fixture whose default was `{ sets: [] }`. forPublic() is
 * what strips the price, the purchase price, the condition, the grade, the
 * notes, the quantity and the row id before any of this leaves the building,
 * and not one line held it to that: the whole file passed with `forPublic`
 * deleted from the route. cards-public.test.ts proves the function; this is the
 * one place that proves the route calls it, and it is an unkeyed route.
 */
const ownerOf = vi.fn();
const getPublicCollection = vi.fn();

vi.mock("@/lib/core/collection/collection", () => ({
  ownerOf: (...a: unknown[]) => ownerOf(...a),
  getPublicCollection: (...a: unknown[]) => getPublicCollection(...a),
}));

const { GET } = await import("./route");

/**
 * Every private field carries a value a `JSON.stringify` search can find, which
 * is the point: a null in a fixture cannot prove it was nulled on purpose.
 */
const variant = (owned: boolean) => ({
  id: "row-abcdef",
  rarity: "Common",
  owned,
  finish: "reverse-holo",
  foilPattern: "cosmos",
  quantity: 7,
  condition: "Near Mint",
  grade: "PSA 10",
  language: "ja",
  purchasePrice: 42.5,
  purchaseDate: "2026-01-02",
  notes: "bought at the shop on the corner",
  isFavorite: true,
  acquiredAt: "2026-01-02",
  excluded: true,
  collectionId: "88888888-8888-4888-8888-888888888888",
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
  price: { low: 1, market: 90, avg30: 95, nm: { low: 95, mid: 100, high: 110 } },
  priceHolo: { low: 2, market: 180, avg30: 190, nm: null },
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

  it("publishes nothing of the owner's own copy but its rarity and whether it is held", async () => {
    // The assertion this file did not have. forPublic() is the only thing
    // between an unkeyed route and what somebody paid for every card, in what
    // condition, graded how, with their notes attached and how many they hold —
    // and every test here passed with the call deleted.
    getPublicCollection.mockResolvedValue({ sets: SETS, failed: false });
    const body = await (await get()).json();
    const [copy] = body.sets[0].cards[0].variants;
    expect(copy).toMatchObject({ rarity: "Common", owned: true });
    for (const key of [
      "id",
      "finish",
      "foilPattern",
      "quantity",
      "condition",
      "grade",
      "language",
      "purchasePrice",
      "purchaseDate",
      "notes",
      "acquiredAt",
      "collectionId",
    ]) {
      expect(copy[key], `${key} reached a stranger`).toBeNull();
    }
    expect(copy.isFavorite).toBe(false);
    expect(copy.excluded).toBe(false);
    expect(body.sets[0].cards[0].price).toBeNull();
    expect(body.sets[0].cards[0].priceHolo).toBeNull();
  });

  it("carries none of it anywhere in the serialised payload either", async () => {
    // The belt to the braces: whatever shape a card takes next, none of these
    // strings may appear in what crosses the wire to somebody with no account.
    getPublicCollection.mockResolvedValue({ sets: SETS, failed: false });
    const json = JSON.stringify(await (await get()).json());
    for (const secret of ["42.5", "PSA 10", "Near Mint", "corner", "row-abcdef", "88888888"]) {
      expect(json, `${secret} reached a stranger`).not.toContain(secret);
    }
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
