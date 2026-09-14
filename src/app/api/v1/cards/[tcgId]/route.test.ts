import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * One card behind the key, and the two answers that must stay apart: a card
 * TCGdex does not have is a 404 the client may keep; a TCGdex that does not
 * answer is a 503 nothing may cache. They used to be the same 404.
 */
const authorise = vi.fn();
const getCardDetail = vi.fn();

vi.mock("@/lib/api/guard", () => ({
  authorise: (...a: unknown[]) => authorise(...a),
  refused: (r: { status?: number }) => "status" in r,
  readHeaders: () => ({ "Cache-Control": "private, no-store" }),
}));
vi.mock("@/lib/core/collection/cards", () => ({
  getCardDetail: (...a: unknown[]) => getCardDetail(...a),
}));
/* The copy's sheet (card-sheet.ts): none by default, so these tests read the card as TCGdex answers
   it; the ones about the copy hand a sheet in. */
const readCardSheet = vi.fn();
vi.mock("@/lib/storage/supabase", () => ({ adminClient: () => null }));
vi.mock("@/lib/core/catalogue/card-sheet", async () => {
  const actual = await vi.importActual<typeof import("@/lib/core/catalogue/card-sheet")>(
    "@/lib/core/catalogue/card-sheet",
  );
  return {
    ...actual,
    readCardSheet: (...a: unknown[]) => readCardSheet(...a),
    eraRaritiesFromCopy: async () => ["Promo"],
  };
});
/* The printings beside the card are five real TCGdex reads, three attempts each, when left
   unmocked — which this test did, and the CI runner's 2026-09-11 15:39 run timed out on it at
   5 s (main, #270's run), the only red thing in it. A unit test asks the network for nothing. */
const languagesOf = vi.fn(async () => ["en", "de"]);
vi.mock("@/lib/core/catalogue/card-languages", () => ({
  WESTERN: ["en", "de", "fr", "it", "es", "pt", "nl"],
  languagesOf: () => languagesOf(),
}));
/* The day's dollar rate, which the route reads so the price can be TCGplayer's in euros. The
   real one sits in collection.ts behind server-only and asks frankfurter; neither belongs here. */
const usdToEurForRequest = vi.fn();
const detailPrice = vi.fn();
vi.mock("@/lib/core/collection/collection", () => ({
  usdToEurForRequest: () => usdToEurForRequest(),
  detailPrice: (...a: unknown[]) => detailPrice(...a),
}));
const raritiesOfEra = vi.fn();
vi.mock("@/lib/core/catalogue/catalogue", () => ({
  raritiesOfEra: (...a: unknown[]) => raritiesOfEra(...a),
}));

const serieOfSet = vi.fn();
vi.mock("@/lib/core/catalogue/era-rarities", () => ({
  serieOfSet: (...a: unknown[]) => serieOfSet(...a),
}));

const { GET } = await import("./route");

const get = (tcgId = "sv03-125") =>
  GET(new Request(`https://api.cardorb.com/v1/cards/${tcgId}`), {
    params: Promise.resolve({ tcgId }),
  });

beforeEach(() => {
  readCardSheet.mockResolvedValue(null);
  authorise.mockResolvedValue({ userId: "me-uuid", email: "me@example.com", username: "me" });
  getCardDetail.mockResolvedValue({ id: "sv03-125", name: "Charizard" });
  usdToEurForRequest.mockResolvedValue(0.92);
  serieOfSet.mockResolvedValue(null);
  detailPrice.mockImplementation(async (card: object) => card);
});
afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/cards/[tcgId]", () => {
  it("refuses when authorisation refuses", async () => {
    authorise.mockResolvedValue({ status: 401, error: "Sign in to see this." });
    expect((await get()).status).toBe(401);
    expect(getCardDetail).not.toHaveBeenCalled();
  });

  it("answers the card", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: "sv03-125",
      name: "Charizard",
      languages: ["en", "de"],
      eraRarities: null,
      foilPatterns: null,
    });
  });

  /* The era's rarities, for the cards that need them and no others: a promo answers "Promo",
     which is the set's mark and not a rarity, and somebody has to say what the card is. A card
     the catalogue has named needs no list and the walk is not made. */
  it("answers the era's rarities for a card the catalogue could not name", async () => {
    getCardDetail.mockResolvedValue({
      id: "svp-085",
      name: "Pikachu with Grey Felt Hat",
      rarity: "Promo",
      set: { id: "svp" },
    });
    raritiesOfEra.mockResolvedValue(["Common", "Illustration rare"]);
    expect((await get("svp-085")).status).toBe(200);
    expect(raritiesOfEra).toHaveBeenCalledWith("svp");
  });

  it("asks for no era rarities where the catalogue named the card", async () => {
    getCardDetail.mockResolvedValue({
      id: "sv03-125",
      name: "Charizard",
      rarity: "Double rare",
      set: { id: "sv03" },
    });
    const res = await get();
    expect((await res.json()).eraRarities).toBeNull();
    expect(raritiesOfEra).not.toHaveBeenCalled();
  });

  /* A Wizards holo had its set's one foil, so a pattern is not something to ask; a later card's
     answer is left to its printings. */
  it("answers no foil patterns for a Wizards card and no answer for a later one", async () => {
    getCardDetail.mockResolvedValue({
      id: "base1-8",
      name: "Machamp",
      rarity: "Rare Holo",
      set: { id: "base1" },
    });
    serieOfSet.mockResolvedValue("base");
    expect((await (await get("base1-8")).json()).foilPatterns).toEqual([]);
    serieOfSet.mockResolvedValue("sv");
    expect((await (await get()).json()).foilPatterns).toBeNull();
    serieOfSet.mockRejectedValue(new Error("down"));
    expect((await (await get()).json()).foilPatterns).toBeNull();
  });

  it("404s a card the catalogue does not know", async () => {
    getCardDetail.mockResolvedValue(null);
    const res = await get();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "No such card." });
  });

  it("503s, uncached, when the catalogue does not answer", async () => {
    getCardDetail.mockRejectedValue(new Error("fetch failed"));
    const res = await get();
    expect(res.status).toBe(503);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({
      error: "That card could not be read. Try again in a moment.",
    });
  });
});

describe("the price's currency", () => {
  // The price on a card is TCGplayer's dollars since 2026-09-12. Without the day's rate the
  // detail has no price at all rather than one in the wrong currency, so the route must hand
  // the rate on, and hand on null when it could not be read.
  it("passes the day's dollar rate to the card, and null when there is none", async () => {
    await get();
    expect(getCardDetail).toHaveBeenLastCalledWith("sv03-125", null, 0.92);
    usdToEurForRequest.mockResolvedValueOnce(null);
    await get();
    expect(getCardDetail).toHaveBeenLastCalledWith("sv03-125", null, null);
  });

  // TCGdex relays no TCGplayer figure for a Japanese card, so its price is the Japanese shelf's.
  it("prices a card from the one TCGplayer read, on the shelf of its language", async () => {
    getCardDetail.mockResolvedValue({ id: "SV1a-007", price: null, tcgplayerId: null });
    detailPrice.mockImplementation(async (card: object) => ({
      ...card,
      price: { market: 2 },
      tcgplayerId: 640001,
    }));
    const res = await GET(new Request("https://api.cardorb.com/v1/cards/SV1a-007?language=ja"), {
      params: Promise.resolve({ tcgId: "SV1a-007" }),
    });
    expect(detailPrice).toHaveBeenCalledWith(
      { id: "SV1a-007", price: null, tcgplayerId: null },
      "ja",
      0.92,
    );
    expect(await res.json()).toMatchObject({ price: { market: 2 }, tcgplayerId: 640001 });

    detailPrice.mockClear();
    await get();
    expect(detailPrice).toHaveBeenCalledWith(expect.anything(), null, 0.92);
  });

  it("reads an English card's sheet out of the copy and asks TCGdex nothing", async () => {
    readCardSheet.mockResolvedValue({
      card: {
        id: "base1-8",
        set_id: "base1",
        local_id: "8",
        name: "Machamp",
        set_name: "Base Set",
        series: "Base",
        release_date: "1999/01/09",
        rarity: null,
        types: ["Fighting"],
        image: "https://images.cardorb.com/en/base/base1/8",
        category: "Pokemon",
        trainer_type: null,
        full_art: false,
        illustrator: "Ken Sugimori",
        hp: 100,
        stage: "Stage2",
        evolve_from: "Machoke",
        regulation_mark: null,
        first_edition: true,
        variants: [{ type: "holo" }],
        languages: ["de", "en"],
      },
      set: {
        id: "base1",
        name: "Base Set",
        logo: "https://images.cardorb.com/logo",
        total: 102,
        serie_id: "base",
      },
    });
    const res = await get("base1-8");
    expect(res.status).toBe(200);
    expect(getCardDetail).not.toHaveBeenCalled();
    expect(languagesOf).not.toHaveBeenCalled();
    expect(serieOfSet).not.toHaveBeenCalled();
    expect(raritiesOfEra).not.toHaveBeenCalled();
    expect(await res.json()).toMatchObject({
      id: "base1-8",
      illustrator: "Ken Sugimori",
      hp: 100,
      evolveFrom: "Machoke",
      firstEdition: true,
      printings: [{ finish: "holo", foilPattern: null }],
      set: { id: "base1", total: 102 },
      languages: ["en", "de"],
      eraRarities: ["Promo"],
      foilPatterns: [],
    });
  });
});
