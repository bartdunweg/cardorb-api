import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authorise = vi.fn();
const mirrorCards = vi.fn();
const getRows = vi.fn();
const tcgplayerPricesFor = vi.fn(
  async (..._a: unknown[]): Promise<Map<string, unknown>> => new Map(),
);
const pagePrintings = vi.fn(async (..._a: unknown[]) => new Map());
/* The printings are read out of the copy; their rule has its own tests (headline-printing.test.ts). */
const shelfRead = vi.fn(async () => [{ id: "base1", name: "Base" }]);

vi.mock("@/lib/core/catalogue/page-printings", () => ({
  pagePrintings: (...a: unknown[]) => pagePrintings(...a),
}));
vi.mock("@/lib/api/guard", () => ({
  authorise: (...a: unknown[]) => authorise(...a),
  /* One mock behind both doors, as the search route's tests do it. The route asks
     authoriseOpen() since the catalogue opened, and every test written against authorise()
     still says what it said: a viewer, a refusal, or now null for a reader who offered no
     credential at all. */
  authoriseOpen: (...a: unknown[]) => authorise(...a),
  refused: (r: { status?: number }) => "status" in r,
  /* Distinguishable on purpose: the point of two header sets is which answer carries which,
     and `{}` for both is what let a cacheable refusal past review on the shelf route. */
  readHeaders: () => ({ "Cache-Control": "private, no-store" }),
  openReadHeaders: () => ({ "Cache-Control": "public, max-age=0, s-maxage=60" }),
}));
vi.mock("@/lib/core/catalogue/mirror", () => ({
  mirrorCards: (...a: unknown[]) => mirrorCards(...a),
}));
vi.mock("@/lib/core/catalogue/catalogue", () => ({
  englishShelfSets: () => shelfRead(),
}));
vi.mock("@/lib/core/collection/collection", () => ({
  getRows: (...a: unknown[]) => getRows(...a),
  tcgplayerPricesFor: (...a: unknown[]) => tcgplayerPricesFor(...a),
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
  tcgplayerPricesFor.mockImplementation(async () => new Map());
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

  it("answers the cards with the viewer's marks and TCGplayer's price, asking the copy once per id", async () => {
    tcgplayerPricesFor.mockImplementation(
      async (...a: unknown[]) =>
        new Map((a[0] as string[]).map((id) => [id, { price: { market: 12.5 } }])),
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
      printedNumber: "4",
    });
  });

  it("prices each card at its headline printing and names it, as a search hit is", async () => {
    tcgplayerPricesFor.mockImplementation(
      async () => new Map([["base1-4", { price: { market: 1.5 }, printing: "reverse-holo" }]]),
    );
    const { cards } = await (await get("base1-4")).json();
    expect(pagePrintings).toHaveBeenCalledWith([{ key: "base1-4", sheet: undefined }], null);
    expect(tcgplayerPricesFor).toHaveBeenCalledWith(["base1-4"], null, expect.any(Promise));
    expect(cards[0]).toMatchObject({ price: { market: 1.5 }, printing: "reverse-holo" });
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

  /* The command palette asks this route for the twenty hits it is about to show, and it has to
     work for a visitor with no account. What such a reader must not get is a holding field
     reading zero: absent says "we did not look", where 0 and false would say "you have none of
     this", a claim about a collection nobody named. */
  describe("without a credential", () => {
    beforeEach(() => {
      authorise.mockResolvedValue(null);
    });

    it("answers the cards to a reader who offered nothing", async () => {
      const res = await get("base1-4");
      expect(res.status).toBe(200);
      const { cards } = await res.json();
      expect(cards).toHaveLength(1);
      expect(cards[0]).toMatchObject({ id: "base1-4", name: "Charizard", printedNumber: "4" });
    });

    it("leaves the holding fields out rather than answering none held", async () => {
      const { cards } = await (await get("base1-4")).json();
      expect(cards[0]).not.toHaveProperty("owned");
      expect(cards[0]).not.toHaveProperty("wishlist");
      expect(cards[0]).not.toHaveProperty("quantity");
      expect(cards[0]).not.toHaveProperty("itemIds");
    });

    it("keeps the price, which is the card's own fact", async () => {
      tcgplayerPricesFor.mockImplementation(
        async () => new Map([["base1-4", { price: { market: 9.5 }, printing: "holo" }]]),
      );
      const { cards } = await (await get("base1-4")).json();
      expect(cards[0]).toMatchObject({ price: { market: 9.5 }, printing: "holo" });
    });

    it("does not read anybody's rows", async () => {
      expect((await get("base1-4")).status).toBe(200);
      expect(getRows).not.toHaveBeenCalled();
    });

    it("answers with the open window, which a shared cache may hold", async () => {
      const res = await get("base1-4");
      expect(res.headers.get("cache-control")).toBe("public, max-age=0, s-maxage=60");
    });

    /* A refusal is nobody's to hold: sent with the open window, one bad minute would be stored
       by the shared cache and handed to every signed-out visitor until it expired. */
    it("sends a refusal private, not with the open window", async () => {
      authorise.mockResolvedValue({ status: 401, error: "Sign in to see this." });
      const res = await get("base1-4");
      expect(res.status).toBe(401);
      expect(res.headers.get("cache-control")).toBe("private, no-store");
    });

    it("sends the 400 on a bad id list private too", async () => {
      const res = await get("");
      expect(res.status).toBe(400);
      expect(res.headers.get("cache-control")).toBe("private, no-store");
    });
  });
});

/**
 * The shelf is only ever the index ownershipIndex files a reader's rows under. Without a reader
 * there is nothing to file, so reading it is two store round trips thrown away, on the route the
 * palette calls for every keystroke's worth of hits.
 */
it("does not read the shelf it would have nothing to do with", async () => {
  authorise.mockResolvedValue(null);
  shelfRead.mockClear();
  await GET(new Request("https://api.test/api/v1/catalog/cards?ids=base1-4"));
  expect(shelfRead).not.toHaveBeenCalled();
});
