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
/* The printings beside the card are five real TCGdex reads, three attempts each, when left
   unmocked — which this test did, and the CI runner's 2026-09-11 15:39 run timed out on it at
   5 s (main, #270's run), the only red thing in it. A unit test asks the network for nothing. */
vi.mock("@/lib/core/catalogue/card-languages", () => ({
  languagesOf: async () => ["en", "de"],
}));
/* The day's dollar rate, which the route reads so the price can be TCGplayer's in euros. The
   real one sits in collection.ts behind server-only and asks frankfurter; neither belongs here. */
const usdToEurForRequest = vi.fn();
vi.mock("@/lib/core/collection/collection", () => ({
  usdToEurForRequest: () => usdToEurForRequest(),
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
  authorise.mockResolvedValue({ userId: "me-uuid", email: "me@example.com", username: "me" });
  getCardDetail.mockResolvedValue({ id: "sv03-125", name: "Charizard" });
  usdToEurForRequest.mockResolvedValue(0.92);
  serieOfSet.mockResolvedValue(null);
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
});
