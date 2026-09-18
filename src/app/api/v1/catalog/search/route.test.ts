import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authorise = vi.fn();
const searchCards = vi.fn();
const getRows = vi.fn();
const tcgplayerPricesFor = vi.fn(async (..._a: unknown[]) => new Map());
const englishSets = vi.fn(async () => [{ id: "base1", name: "Base" }]);
const pagePrintings = vi.fn(async (..._a: unknown[]) => new Map());

// See app/api/v1/cards/[id]/route.test.ts for why guard.ts is replaced
// wholesale rather than importOriginal()-ed.
vi.mock("@/lib/api/guard", () => ({
  authorise: (...a: unknown[]) => authorise(...a),
  refused: (r: { status?: number }) => "status" in r,
  readHeaders: () => ({}),
}));
vi.mock("@/lib/core/catalogue/tcgdex-search", () => ({
  searchCards: (...a: unknown[]) => searchCards(...a),
}));
/* The English set index is a network read; the join resolves the fixture rows against this one. */
vi.mock("@/lib/core/catalogue/catalogue", () => ({
  englishShelfSets: () => englishSets(),
}));
vi.mock("@/lib/core/catalogue/tcgdex-browse", () => ({
  isBrowseLanguage: (v: unknown) => v === "ja",
}));
/* Both of these are `import "server-only"` underneath — viewer.ts directly,
   collection.ts through the Supabase clients — which throws the moment vitest
   imports them. Replaced wholesale for that reason, the same way guard.ts is,
   and then used for the ownership overlay the route attaches to every result. */
vi.mock("@/lib/core/collection/collection", () => ({
  getRows: (...a: unknown[]) => getRows(...a),
  tcgplayerPricesFor: (...a: unknown[]) => tcgplayerPricesFor(...a),
}));
/* The printings are read out of the copy; their rule has its own tests (headline-printing.test.ts). */
vi.mock("@/lib/core/catalogue/page-printings", () => ({
  pagePrintings: (...a: unknown[]) => pagePrintings(...a),
}));
vi.mock("@/lib/api/viewer", () => ({ bearer: () => null }));
/* `import "server-only"` underneath, like the two above. The route hands the search the
   service role's client for the catalogue's copy; here there is none, and the search is told so. */
vi.mock("@/lib/storage/supabase", () => ({ adminClient: () => null }));

const { GET } = await import("./route");

const VIEWER = { userId: "me-uuid", email: "me@example.com", username: "me" };

const search = (query: URLSearchParams) =>
  GET(new Request(`https://cardorb.com/api/v1/catalog/search?${query}`));

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

beforeEach(() => {
  authorise.mockResolvedValue(VIEWER);
  getRows.mockResolvedValue({ rows: [], failed: false });
  searchCards.mockResolvedValue({
    total: 1,
    cards: [
      {
        id: "base1-4",
        number: "4",
        name: "Charizard",
        setName: "Base",
        image: "https://img/base1/4/small",
        imageHigh: "https://img/base1/4/large",
        rarity: "Rare Holo",
        types: ["Fire"],
        tcgId: "base1-4",
      },
    ],
  });
});
afterEach(() => {
  // Reset, not cleared: one test gives the prices a lasting answer.
  tcgplayerPricesFor.mockReset();
  tcgplayerPricesFor.mockImplementation(async () => new Map());
  searchCards.mockClear();
  getRows.mockClear();
  englishSets.mockClear();
});

describe("GET /api/v1/catalog/search", () => {
  it("refuses a query shorter than two characters", async () => {
    const res = await search(new URLSearchParams({ query: "c" }));
    expect(res.status).toBe(400);
    expect(searchCards).not.toHaveBeenCalled();
  });

  it("refuses a missing query the same way", async () => {
    const res = await search(new URLSearchParams());
    expect(res.status).toBe(400);
    expect(searchCards).not.toHaveBeenCalled();
  });

  it("refuses when authorisation refuses", async () => {
    authorise.mockResolvedValue({ status: 401, error: "Sign in to see this." });
    const res = await search(new URLSearchParams({ query: "char" }));
    expect(res.status).toBe(401);
    expect(searchCards).not.toHaveBeenCalled();
  });

  it("passes the trimmed query through and returns what it finds", async () => {
    const res = await search(new URLSearchParams({ query: "  char  " }));
    expect(searchCards).toHaveBeenCalledWith("char", 1, null, null, { fullArt: false });
    const { cards } = await res.json();
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ id: "base1-4", name: "Charizard", rarity: "Rare Holo" });
    expect(cards[0].printedNumber).toBe("4");
  });

  it("says a Classic Collection card's printed number beside the catalogue's", async () => {
    searchCards.mockResolvedValueOnce({
      total: 1,
      cards: [
        {
          id: "cel25cc-CC001",
          number: "CC001",
          name: "Blastoise",
          setName: "Celebrations Classic Collection",
          image: null,
          imageHigh: null,
          rarity: null,
          types: [],
          tcgId: "cel25cc-CC001",
        },
      ],
    });
    const { cards } = await (await search(new URLSearchParams({ query: "blastoise" }))).json();
    expect(cards[0]).toMatchObject({ number: "CC001", printedNumber: "2/102" });
  });

  it("switches to filter mode when any filter field is present, ignoring query", async () => {
    const res = await search(new URLSearchParams({ name: "char", query: "should be ignored" }));
    expect(searchCards).toHaveBeenCalledWith(
      { name: "char", number: "", set: "", type: "" },
      1,
      null,
      null,
      { fullArt: false },
    );
    const { cards } = await res.json();
    expect(cards).toHaveLength(1);
  });

  it("does not require two characters in filter mode", async () => {
    const res = await search(new URLSearchParams({ number: "6" }));
    expect(res.status).toBe(200);
    expect(searchCards).toHaveBeenCalledWith(
      { name: "", number: "6", set: "", type: "" },
      1,
      null,
      null,
      { fullArt: false },
    );
  });

  /* Full art narrows whatever was asked, and on its own is a question: every full art in the
     catalogue. So it lifts the two-character rule the free box has. */
  it("passes ?fullArt=1 down, and takes it as a query on its own", async () => {
    await search(new URLSearchParams({ query: "char", fullArt: "1" }));
    expect(searchCards).toHaveBeenCalledWith("char", 1, null, null, { fullArt: true });
    const res = await search(new URLSearchParams({ fullArt: "1" }));
    expect(res.status).toBe(200);
    expect(searchCards).toHaveBeenLastCalledWith("", 1, null, null, { fullArt: true });
  });

  it("trims filter fields before checking whether any are present", async () => {
    const res = await search(new URLSearchParams({ name: "   " }));
    expect(res.status).toBe(400);
    expect(searchCards).not.toHaveBeenCalled();
  });

  it("forwards an explicit page number", async () => {
    await search(new URLSearchParams({ query: "char", page: "3" }));
    expect(searchCards).toHaveBeenCalledWith("char", 3, null, null, { fullArt: false });
  });

  it("falls back to page 1 for an invalid page value", async () => {
    await search(new URLSearchParams({ query: "char", page: "not-a-number" }));
    expect(searchCards).toHaveBeenCalledWith("char", 1, null, null, { fullArt: false });

    await search(new URLSearchParams({ query: "char", page: "-1" }));
    expect(searchCards).toHaveBeenCalledWith("char", 1, null, null, { fullArt: false });
  });

  it("answers 502 with a sentence, not 400, when searchCards fails", async () => {
    searchCards.mockRejectedValueOnce(new Error("pokemontcg.io search unavailable"));
    const res = await search(new URLSearchParams({ query: "char" }));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("The catalogue did not answer. Try again in a moment.");
  });

  it("marks a result the viewer already holds", async () => {
    getRows.mockResolvedValue({ rows: [row({ quantity: 2 })], failed: false });
    const res = await search(new URLSearchParams({ query: "char" }));
    const { cards } = await res.json();
    expect(cards[0]).toMatchObject({
      owned: true,
      wishlist: false,
      quantity: 2,
      itemIds: ["row-1"],
    });
  });

  it("leaves a result unmarked when the viewer holds a different card at that number", async () => {
    getRows.mockResolvedValue({ rows: [row({ name: "Blastoise" })], failed: false });
    const res = await search(new URLSearchParams({ query: "char" }));
    const { cards } = await res.json();
    expect(cards[0]).toMatchObject({ owned: false, wishlist: false, quantity: 0, itemIds: [] });
  });

  it("answers 502 when the search itself failed, whatever the rows read said", async () => {
    /* The rows are read alongside the search since the four reads went parallel; a failed
       search still fails the request, and the rows do not turn it into an empty answer. */
    searchCards.mockRejectedValueOnce(new Error("catalogue search unavailable"));
    getRows.mockResolvedValue({ rows: [row()], failed: false });
    const res = await search(new URLSearchParams({ query: "char" }));
    expect(res.status).toBe(502);
  });
  it("asks the catalogue named by ?language, and joins ownership by that language alone", async () => {
    const res = await search(new URLSearchParams({ query: "リザードン", language: "ja" }));
    expect(res.status).toBe(200);
    expect(searchCards).toHaveBeenCalledWith("リザードン", 1, "ja", null, { fullArt: false });
    expect(englishSets).not.toHaveBeenCalled();
  });

  it("reads language=en as the English catalogue", async () => {
    await search(new URLSearchParams({ query: "char", language: "en" }));
    expect(searchCards).toHaveBeenCalledWith("char", 1, null, null, { fullArt: false });
  });

  it("prices every result from TCGplayer, by the id everything priced is keyed by", async () => {
    tcgplayerPricesFor.mockResolvedValue(new Map([["base1-4", { price: { market: 12.5 } }]]));
    const res = await search(new URLSearchParams({ query: "char", language: "ja" }));
    const { cards } = await res.json();
    expect(tcgplayerPricesFor).toHaveBeenCalledWith(["base1-4"], "ja", expect.any(Promise));
    expect(cards[0]).toMatchObject({ price: { market: 12.5 } });
  });

  it("leaves a null price under a result TCGplayer does not price", async () => {
    const res = await search(new URLSearchParams({ query: "char" }));
    const { cards } = await res.json();
    expect(tcgplayerPricesFor).toHaveBeenCalledWith(["base1-4"], null, expect.any(Promise));
    expect(cards[0]).toMatchObject({ price: null, printing: null });
  });

  /* The set page's rule on a search hit: the figure is the printing the card's sheet opens on. The
     prices here are headlinePrinting over the printings the route hands over, so what is asserted
     is that the route reads each hit's printings and gives them to the pricing. */
  it("prices a holo rare with a reverse at the reverse, as its set page and sheet do", async () => {
    const { headlinePrinting } = await import("@/lib/core/collection/headline-printing");
    pagePrintings.mockResolvedValue(
      new Map([
        [
          "base1-4",
          [
            { finish: "reverse-holo", foilPattern: null },
            { finish: "holo", foilPattern: null },
          ],
        ],
      ]),
    );
    const shelf = {
      holofoil: { market: 20, productId: 1 },
      "reverse-holofoil": { market: 3, productId: 1 },
    };
    tcgplayerPricesFor.mockImplementation(async (...a: unknown[]) => {
      const printings = await (a[2] as Promise<Map<string, never[]>>);
      const h = headlinePrinting(printings.get("base1-4") ?? [], shelf, shelf.holofoil)!;
      return new Map([["base1-4", { price: { market: h.usd.market }, printing: h.printing }]]);
    });
    const { cards } = await (await search(new URLSearchParams({ query: "char" }))).json();
    expect(pagePrintings).toHaveBeenCalledWith([{ key: "base1-4", sheet: undefined }], null);
    expect(cards[0]).toMatchObject({ price: { market: 3 }, printing: "reverse-holo" });
  });

  it("refuses a language it has no catalogue for", async () => {
    const res = await search(new URLSearchParams({ query: "char", language: "de" }));
    expect(res.status).toBe(400);
    expect(searchCards).not.toHaveBeenCalled();
  });
});
