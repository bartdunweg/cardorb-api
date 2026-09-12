import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authorise = vi.fn();
const englishSet = vi.fn();

const SET = {
  id: "base1",
  name: "Base",
  series: "Base",
  releaseDate: "1999/01/09",
  total: 102,
  printedTotal: 102,
  logo: null,
  symbol: null,
};

const getRows = vi.fn();
const tcgplayerPricesFor = vi.fn();
const setIn = vi.fn();

/* Same three server-only modules replaced wholesale as in the sibling route's
   test; the ownership join is the real, pure one. */
vi.mock("@/lib/api/guard", () => ({
  authorise: (...a: unknown[]) => authorise(...a),
  refused: (r: { status?: number }) => "status" in r,
  readHeaders: () => ({}),
}));
vi.mock("@/lib/api/viewer", () => ({ bearer: () => null }));
vi.mock("@/lib/core/collection/collection", () => ({
  getRows: (...a: unknown[]) => getRows(...a),
  tcgplayerPricesFor: (...a: unknown[]) => tcgplayerPricesFor(...a),
}));
/* Both shelves are network reads; the language check is the real, pure one, and so is
   the set index the ownership join resolves a row's set name against. */
vi.mock("@/lib/core/catalogue/tcgdex-browse", async (real) => ({
  ...(await real<typeof import("@/lib/core/catalogue/tcgdex-browse")>()),
  englishSet: (...a: unknown[]) => englishSet(...a),
  englishSets: async () => [SET],
  setIn: (...a: unknown[]) => setIn(...a),
}));
/* The copy is the store, and the store is server-only. `mirrorScans` has its own tests; the
   default here is a copy that holds nothing, which leaves the addresses this route built. */
const mirrorScans = vi.fn(
  async () => new Map<string, { image: string | null; imageHigh: string | null }>(),
);
vi.mock("@/lib/core/catalogue/mirror", () => ({
  mirrorScans: (...a: unknown[]) => mirrorScans(...(a as [])),
}));
vi.mock("@/lib/storage/supabase", () => ({ adminClient: () => ({}) }));
/* The Limitless probe is a network call with its own tests; replaced with the
   identity it degrades to when the probe cannot be made. */
vi.mock("@/lib/core/catalogue/browse-artwork", () => ({
  withLimitlessScans: (_lang: unknown, cards: unknown) => cards,
}));

const { GET } = await import("./route");

const VIEWER = { userId: "me-uuid", email: "me@example.com", username: "me" };

const card = (number: string, name = "Bulbasaur") => ({
  id: `base1-${number}`,
  number,
  name,
  setName: "Base",
  image: null,
  imageHigh: null,
  rarity: null,
  types: [],
});

const row = (over: Record<string, unknown> = {}) => ({
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
  quantity: 1,
  condition: null,
  grade: null,
  language: null,
  purchasePrice: null,
  purchaseDate: null,
  notes: null,
  isFavorite: false,
  ...over,
});

const open = (query = "", setId = "base1") =>
  GET(new Request(`https://cardorb.com/api/v1/catalog/sets/${setId}?${query}`), {
    params: Promise.resolve({ setId }),
  });

beforeEach(() => {
  authorise.mockResolvedValue(VIEWER);
  englishSet.mockResolvedValue({ set: SET, cards: [card("1"), card("2"), card("4", "Charizard")] });
  getRows.mockResolvedValue({ rows: [], failed: false });
  tcgplayerPricesFor.mockResolvedValue(new Map());
});
afterEach(() => vi.clearAllMocks());

describe("GET /api/v1/catalog/sets/[setId]", () => {
  it("refuses when authorisation refuses, without asking the catalogue", async () => {
    authorise.mockResolvedValue({ status: 401, error: "Sign in to see this." });
    const res = await open();
    expect(res.status).toBe(401);
    expect(englishSet).not.toHaveBeenCalled();
  });

  it("404s an id nobody carries, without asking for its cards", async () => {
    englishSet.mockResolvedValue(null);
    const res = await open("", "nope");
    expect(res.status).toBe(404);
  });

  it("answers the whole set with the viewer's cards marked", async () => {
    getRows.mockResolvedValue({ rows: [row({ quantity: 3 })], failed: false });
    const body = await (await open()).json();

    expect(body.set).toMatchObject({ id: "base1", name: "Base" });
    expect(body.totalCount).toBe(3);
    expect(body.ownedCount).toBe(1);
    expect(body.cards.map((c: { owned: boolean }) => c.owned)).toEqual([false, false, true]);
    expect(body.cards[2]).toMatchObject({ quantity: 3, itemIds: ["row-1"] });
  });

  /* The copy is where a picture has been checked: this route builds one from the serie, the
     set and the number, and TCGdex has no file behind it for a handful of cards a set. */
  it("takes the page's pictures from the catalogue's copy where it holds them", async () => {
    englishSet.mockResolvedValue({
      set: SET,
      cards: [
        { ...card("85"), image: "https://assets.tcgdex.net/en/sv/svp/085/low.webp" },
        { ...card("86"), image: "https://assets.tcgdex.net/en/sv/svp/086/low.webp" },
      ],
    });
    mirrorScans.mockResolvedValue(
      new Map([
        ["base1-85", { image: "https://images.pokemontcg.io/svp/85.png", imageHigh: null }],
      ]),
    );
    const body = await (await open()).json();
    expect(body.cards.map((c: { image: string | null }) => c.image)).toEqual([
      "https://images.pokemontcg.io/svp/85.png",
      "https://assets.tcgdex.net/en/sv/svp/086/low.webp",
    ]);
  });

  it("keeps what it built when the copy cannot be read", async () => {
    englishSet.mockResolvedValue({
      set: SET,
      cards: [{ ...card("85"), image: "https://assets.tcgdex.net/en/sv/svp/085/low.webp" }],
    });
    mirrorScans.mockRejectedValue(new Error("the store said no"));
    const body = await (await open()).json();
    expect(body.cards[0].image).toBe("https://assets.tcgdex.net/en/sv/svp/085/low.webp");
  });

  it("prints the set's code, and says null rather than nothing where there is none", async () => {
    englishSet.mockResolvedValue({ set: { ...SET, abbreviation: "BS" }, cards: [card("1")] });
    expect((await (await open()).json()).set.abbreviation).toBe("BS");

    // A set read that leaves the field out still answers it, as null.
    setIn.mockResolvedValue({ set: SET, cards: [card("1")] });
    const body = await (await open("language=ja", "sv2a")).json();
    expect(body.set).toHaveProperty("abbreviation", null);
  });

  it("does not ask the copy for another language's shelf, which it does not hold", async () => {
    setIn.mockResolvedValue({ set: SET, cards: [card("1")] });
    await open("language=ja", "sv2a");
    expect(mirrorScans).not.toHaveBeenCalled();
  });

  it("prices the page's cards, and asks after those cards only", async () => {
    getRows.mockResolvedValue({ rows: [], failed: false });
    tcgplayerPricesFor.mockResolvedValue(
      new Map([["base1-4", { price: { market: 340 }, holo: null }]]),
    );
    const body = await (await open()).json();

    const charizard = body.cards.find((c: { id: string }) => c.id === "base1-4");
    expect(charizard.price).toEqual({ market: 340 });
    expect(charizard.priceHolo).toBeNull();
    // A card TCGplayer does not price is a blank line, not a missing field.
    expect(body.cards.find((c: { id: string }) => c.id !== "base1-4").price).toBeNull();
  });

  it("prices by the TCGdex id, which is the only one anything is keyed by", async () => {
    /* The bug this test exists for: pokemontcg.io numbers a card `me5-85` and every price in
       this repo is keyed the TCGdex way, `me05-085`. Looking up by the catalogue's own id
       matched nothing at all, silently, and shipped a field that was always null. */
    englishSet.mockResolvedValue({
      set: SET,
      cards: [{ ...card("85", "Fomantis"), id: "me5-85", tcgId: "me05-085" }],
    });
    getRows.mockResolvedValue({ rows: [], failed: false });
    tcgplayerPricesFor.mockResolvedValue(
      new Map([["me05-085", { price: { market: 2.81 }, holo: null }]]),
    );
    const body = await (await open()).json();

    expect(tcgplayerPricesFor).toHaveBeenLastCalledWith(["me05-085"], null);
    expect(body.cards[0].price).toEqual({ market: 2.81 });
  });

  it("falls back to the card's own id where the catalogues were never matched", async () => {
    // The other-language path: those cards are TCGdex's already, so `id` is the right key.
    englishSet.mockResolvedValue({ set: SET, cards: [{ ...card("85"), id: "me05-085" }] });
    getRows.mockResolvedValue({ rows: [], failed: false });
    tcgplayerPricesFor.mockResolvedValue(
      new Map([["me05-085", { price: { market: 1 }, holo: null }]]),
    );
    const body = await (await open()).json();

    expect(body.cards[0].price).toEqual({ market: 1 });
  });

  it("prices a Japanese set from the Japanese map, by the catalogue's own id", async () => {
    /* The shelf is a fact about the page, not the id: a Japanese set page prices from the
       Japanese shelf, and SM1S-001 is a Japanese card and a different Korean one. */
    setIn.mockResolvedValue({
      set: { ...SET, id: "M1S", name: "Mega Symphonia" },
      cards: [{ ...card("001", "Tangela"), id: "M1S-001", setName: "Mega Symphonia" }],
    });
    getRows.mockResolvedValue({ rows: [], failed: false });
    tcgplayerPricesFor.mockResolvedValue(
      new Map([["M1S-001", { price: { market: 0.04 }, holo: null }]]),
    );
    const body = await (await open("language=ja", "M1S")).json();

    expect(tcgplayerPricesFor).toHaveBeenLastCalledWith(["M1S-001"], "ja");
    expect(body.cards[0].price).toEqual({ market: 0.04 });
  });

  it("prices only the page it returns, not the whole set", async () => {
    getRows.mockResolvedValue({ rows: [], failed: false });
    tcgplayerPricesFor.mockResolvedValue(new Map());
    await open("pageSize=1");

    // 250 lookups for a page of one is the cost this route was careful not to pay.
    expect(tcgplayerPricesFor).toHaveBeenLastCalledWith(
      expect.objectContaining({ length: 1 }),
      null,
    );
  });

  it("counts owned over the whole set rather than over the page", async () => {
    getRows.mockResolvedValue({ rows: [row()], failed: false });
    const body = await (await open("pageSize=1")).json();

    expect(body.cards).toHaveLength(1);
    expect(body.cards[0].owned).toBe(false);
    /* The Charizard is on page 3, and the header still has to say 1 of 3. */
    expect(body.ownedCount).toBe(1);
    expect(body.totalCount).toBe(3);
  });

  it("pages, and says whether there is more", async () => {
    const first = await (await open("pageSize=2")).json();
    expect(first.cards.map((c: { number: string }) => c.number)).toEqual(["1", "2"]);
    expect(first).toMatchObject({ page: 1, pageSize: 2, hasMore: true });

    const second = await (await open("page=2&pageSize=2")).json();
    expect(second.cards.map((c: { number: string }) => c.number)).toEqual(["4"]);
    expect(second).toMatchObject({ page: 2, hasMore: false });
  });

  it("answers an empty page past the end rather than wrapping round", async () => {
    const body = await (await open("page=9&pageSize=2")).json();
    expect(body.cards).toEqual([]);
    expect(body.hasMore).toBe(false);
    expect(body.totalCount).toBe(3);
  });

  it("falls back to the default page and size for nonsense values", async () => {
    const body = await (await open("page=-1&pageSize=0")).json();
    expect(body).toMatchObject({ page: 1, pageSize: 60 });
  });

  it("caps pageSize at the catalogue's own maximum", async () => {
    expect((await (await open("pageSize=5000")).json()).pageSize).toBe(250);
  });

  it("answers 502 with a sentence a client can show when the catalogue refused", async () => {
    englishSet.mockRejectedValue(new Error("TCGdex en set base1 answered 503"));
    const res = await open();
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("The catalogue did not answer. Try again in a moment.");
  });

  it("still serves the set when the collection could not be read, and says so", async () => {
    getRows.mockResolvedValue({ rows: [], failed: true });
    const body = await (await open()).json();

    expect(body.totalCount).toBe(3);
    expect(body.ownedCount).toBe(0);
    expect(body.collectionUnavailable).toBe(true);
  });
});
