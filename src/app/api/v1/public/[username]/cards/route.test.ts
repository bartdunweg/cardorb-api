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
  finish: null as string | null,
  quantity: 1,
  condition: null as string | null,
  grade: null as string | null,
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
  ownerOf.mockResolvedValue({ id: "owner-1", username: "bart", displayName: null, avatarUrl: null, wishlistPublic: false, favoritesPublic: false });
  getPublicCollection.mockResolvedValue({ sets: SETS, failed: false });
});

describe("GET /api/v1/public/{username}/cards", () => {
  it("says how many of a card the owner holds from the rows' quantities, which the public shape drops", async () => {
    getPublicCollection.mockResolvedValue({
      sets: [{ ...SETS[0], cards: [card("Pikachu", [{ ...variant("a"), quantity: 3 }, variant("w", false)])] }],
      failed: false,
    });
    const body = await (await get()).json();
    expect(body.cards[0].copies).toBe(3);
    expect(body.copies).toBe(3);
  });

  it("lists owned cards with a copy count and nothing private", async () => {
    const body = await (await get()).json();
    expect(body.total).toBe(1);
    // One row, two copies: the line under the name says two.
    expect(body.copies).toBe(2);
    expect(body.cards[0]).toEqual({
      key: "Pikachu",
      name: "Pikachu",
      number: "1",
      // The printed number and the set's code are facts about the card, public like its name.
      printedNumber: null,
      set: "Base Set",
      setTitle: "Base Set",
      setAbbr: null,
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
      dexFace: false,
      // The printing and the state, folded over the copies; nobody recorded any here.
      finish: null,
      foilPattern: null,
      edition: null,
      condition: null,
      grade: null,
    });
  });

  it("says which printing a card is and what state it is in where every copy agrees, and nothing where they differ", async () => {
    const holo = { ...variant("a"), finish: "holo", condition: "Near Mint" };
    getPublicCollection.mockResolvedValue({
      sets: [
        {
          ...SETS[0],
          cards: [
            card("Pikachu", [holo, { ...holo, id: "b" }]),
            card("Raichu", [holo, { ...holo, id: "d", condition: "Played" }]),
            card("Mew", [{ ...variant("e"), finish: "holo", grade: "PSA 10" }]),
          ],
        },
      ],
      failed: false,
    });
    const body = await (await get()).json();
    const by = (name: string) => body.cards.find((c: { name: string }) => c.name === name);
    expect(by("Pikachu")).toMatchObject({ finish: "holo", condition: "Near Mint", grade: null });
    expect(by("Raichu")).toMatchObject({ finish: "holo", condition: null });
    expect(by("Mew")).toMatchObject({ finish: "holo", grade: "PSA 10" });
    // Still nothing a copy cost, nor its notes.
    expect(JSON.stringify(body)).not.toContain("private");
  });

  it("prices the cards and the list only for an owner who shows prices", async () => {
    const body = await (await get()).json();
    expect(body.cards[0]).not.toHaveProperty("price");
    expect(body).not.toHaveProperty("value");
    expect(JSON.stringify(body)).not.toContain("9");
    ownerOf.mockResolvedValue({ id: "owner-1", username: "bart", displayName: null, avatarUrl: null, wishlistPublic: true, favoritesPublic: false, pricesPublic: true });
    const priced = await (await get()).json();
    // Two copies at nine: one price on the card, the list worth both.
    expect(priced.cards[0].price).toBe(9);
    expect(priced.value).toBe(18);
    expect(priced.unpriced).toBe(0);
    // A wish is priced too: what its owner is looking for costs something.
    const wishes = await (await get("?list=wishlist")).json();
    expect(wishes.cards[0]).toMatchObject({ name: "Mew", price: 9 });
    expect(wishes.value).toBe(9);
  });

  /* cardorb-api#561: a card listed and never sold shows its lowest listing on the owner's own list,
     and on their public one the same, labelled by its own field and never summed into the value. */
  it("shows a card's lowest listing where no copy has a market figure, never in the value, and only with prices shown", async () => {
    const listing = { market: null, lowestListing: 5771.49, basis: "lowest-listing" };
    getPublicCollection.mockResolvedValue({
      sets: [{ ...SETS[0], cards: [card("Pikachu", [variant("a")]), { ...card("Mew", [variant("c"), variant("d")]), price: listing }] }],
      failed: false,
    });
    const hidden = await (await get()).json();
    expect(JSON.stringify(hidden)).not.toContain("5771");
    expect(hidden).not.toHaveProperty("listed");
    ownerOf.mockResolvedValue({ id: "owner-1", username: "bart", displayName: null, avatarUrl: null, wishlistPublic: false, favoritesPublic: false, pricesPublic: true });
    const body = await (await get()).json();
    const mew = body.cards.find((c: { name: string }) => c.name === "Mew");
    const pikachu = body.cards.find((c: { name: string }) => c.name === "Pikachu");
    expect(mew).toMatchObject({ price: null, listingPrice: 5771.49 });
    expect(pikachu.price).toBe(9);
    expect(pikachu).not.toHaveProperty("listingPrice");
    // The two Mew copies are left out of the value and said as listed.
    expect(body).toMatchObject({ value: 9, unpriced: 2, listed: 2 });
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

  it("shows the favorites only for an owner who does, and refuses another list", async () => {
    expect((await get("?list=favorites")).status).toBe(404);
    // A Pokédex was a list of its own here until 2026-09-12. It is a binder now, so the word is
    // no list at all: the same 400 as any other thing that is not one.
    expect((await get("?list=pokedex")).status).toBe(400);
    expect((await get("?list=binder")).status).toBe(400);
    ownerOf.mockResolvedValue({ id: "owner-1", username: "bart", displayName: null, avatarUrl: null, wishlistPublic: false, favoritesPublic: true });
    const favorites = await (await get("?list=favorites")).json();
    expect(favorites.cards.length).toBeGreaterThan(0);
    expect(favorites.cards.every((c: { favorite: boolean }) => c.favorite)).toBe(true);
  });

  it("says on a wish which printing its owner is after and in what state, where they said", async () => {
    ownerOf.mockResolvedValue({ id: "owner-1", username: "bart", displayName: null, avatarUrl: null, wishlistPublic: true, favoritesPublic: false });
    getPublicCollection.mockResolvedValue({
      sets: [{ ...SETS[0], cards: [card("Mew", [{ ...variant("c", false), finish: "holo", condition: "Near Mint" }])] }],
      failed: false,
    });
    const body = await (await get("?list=wishlist")).json();
    expect(body.cards[0]).toMatchObject({ name: "Mew", finish: "holo", condition: "Near Mint" });
  });
});
