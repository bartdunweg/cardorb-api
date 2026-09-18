import { beforeEach, describe, expect, it, vi } from "vitest";

const authorise = vi.fn();
const getCardPrices = vi.fn();
const defaultPriceLanguage = vi.fn();

vi.mock("@/lib/api/guard", () => ({
  authorise: (...a: unknown[]) => authorise(...a),
  refused: (r: { status?: number }) => "status" in r,
  readHeaders: () => ({}),
}));
vi.mock("@/lib/api/viewer", () => ({
  bearer: (req: Request) => req.headers.get("authorization")?.replace(/^Bearer /, "") ?? null,
}));
vi.mock("@/lib/core/collection/collection", () => ({
  ALL_READINGS: "2000-01-01",
  getCardPrices: (...a: unknown[]) => getCardPrices(...a),
  defaultPriceLanguage: (...a: unknown[]) => defaultPriceLanguage(...a),
}));

const printingListingsOf = vi.fn();
vi.mock("@/lib/core/collection/printing-listings", () => ({
  printingListingsOf: (...a: unknown[]) => printingListingsOf(...a),
}));

const { GET } = await import("./route");

const get = (tcgId = "base1-4", query = "") =>
  GET(
    new Request(`https://cardorb.com/api/v1/cards/${tcgId}/prices${query}`, {
      headers: { authorization: "Bearer t.o.k.e.n" },
    }),
    { params: Promise.resolve({ tcgId }) },
  );

beforeEach(() => {
  vi.clearAllMocks();
  authorise.mockResolvedValue({ userId: "me-uuid", email: "me@example.com", username: "me" });
  defaultPriceLanguage.mockResolvedValue("en");
  printingListingsOf.mockResolvedValue({});
  getCardPrices.mockResolvedValue({
    points: [
      { language: "en", tcgId: "base1-4", date: "2026-09-01", market: 120.5, holo: null },
      { language: "en", tcgId: "base1-4", date: "2026-09-02", market: 121, holo: 300 },
    ],
    failed: false,
  });
});

describe("GET /api/v1/cards/{tcgId}/prices", () => {
  it("asks for the card's readings with the caller's id and credential", async () => {
    await get();
    expect(getCardPrices).toHaveBeenCalledWith(
      "me-uuid",
      [{ tcgId: "base1-4", language: "en" }],
      "t.o.k.e.n",
      "2000-01-01",
    );
  });

  it("answers the dated points, oldest first, without the id repeated", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      points: [
        { date: "2026-09-01", market: 120.5, holo: null },
        { date: "2026-09-02", market: 121, holo: 300 },
      ],
    });
  });

  /* cardorb-api#561: a printing listed and never sold has no line, so a sheet pressing it had
     nothing to show. Its lowest listing comes beside the line, keyed as the line keys printings. */
  it("says each printing's lowest listing where it has no market figure, and still answers the line when that read fails", async () => {
    printingListingsOf.mockResolvedValue({ "reverse-holofoil": 5771.49 });
    const body = await (await get()).json();
    expect(printingListingsOf).toHaveBeenCalledWith("base1-4", "en");
    expect(body.listings).toEqual({ "reverse-holofoil": 5771.49 });
    expect(body.points).toHaveLength(2);
    printingListingsOf.mockRejectedValue(new Error("store down"));
    const res = await get();
    expect(res.status).toBe(200);
    const again = await res.json();
    expect(again).not.toHaveProperty("listings");
    expect(again.points).toHaveLength(2);
  });

  it("hands out this card's points only, whatever wider answer the reader gives", async () => {
    getCardPrices.mockResolvedValue({
      points: [
        { language: "en", tcgId: "base1-4", date: "2026-09-01", market: 120.5, holo: null },
        { language: "en", tcgId: "base1-5", date: "2026-09-01", market: 3, holo: null },
        { language: "ja", tcgId: "base1-4", date: "2026-09-01", market: 9, holo: null },
      ],
      failed: false,
    });
    expect(await (await get()).json()).toEqual({
      points: [{ date: "2026-09-01", market: 120.5, holo: null }],
    });
  });

  // neo4-106 is Shining Celebi in English and Lucky Stadium in Japanese, each with its own line.
  describe("the catalogue the id is from", () => {
    const both = {
      points: [
        { language: "en", tcgId: "neo4-106", date: "2026-09-01", market: 375, holo: 375 },
        { language: "ja", tcgId: "neo4-106", date: "2026-09-01", market: 9, holo: 9 },
      ],
      failed: false,
    };

    it("answers the Japanese card's line for ?language=ja, and the English one's for en", async () => {
      getCardPrices.mockResolvedValue(both);
      const ja = await (await get("neo4-106", "?language=ja")).json();
      expect(getCardPrices.mock.calls[0]![1]).toEqual([{ tcgId: "neo4-106", language: "ja" }]);
      expect(ja.points).toEqual([{ date: "2026-09-01", market: 9, holo: 9 }]);
      const en = await (await get("neo4-106", "?language=en")).json();
      expect(en.points).toEqual([{ date: "2026-09-01", market: 375, holo: 375 }]);
      expect(defaultPriceLanguage).not.toHaveBeenCalled();
    });

    it("takes the id's own catalogue when the caller does not say", async () => {
      defaultPriceLanguage.mockResolvedValue("ja");
      getCardPrices.mockResolvedValue({
        points: [{ language: "ja", tcgId: "SV1a-007", date: "2026-09-01", market: 2, holo: null }],
        failed: false,
      });
      const body = await (await get("SV1a-007")).json();
      expect(defaultPriceLanguage).toHaveBeenCalledWith("SV1a-007");
      expect(getCardPrices.mock.calls[0]![1]).toEqual([{ tcgId: "SV1a-007", language: "ja" }]);
      expect(body.points).toEqual([{ date: "2026-09-01", market: 2, holo: null }]);
    });

    it("refuses a language that is not a catalogue", async () => {
      expect((await get("neo4-106", "?language=de")).status).toBe(400);
      expect(getCardPrices).not.toHaveBeenCalled();
    });

    it("answers 503 when the id's catalogue cannot be read, not a guess", async () => {
      defaultPriceLanguage.mockRejectedValue(new Error("down"));
      vi.spyOn(console, "error").mockImplementation(() => {});
      expect((await get("neo4-106")).status).toBe(503);
      expect(getCardPrices).not.toHaveBeenCalled();
    });
  });

  it("is an empty list for a card with no readings, not a 404", async () => {
    getCardPrices.mockResolvedValue({ points: [], failed: false });
    const res = await get("nobody-1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ points: [] });
  });

  it("answers 503 when the readings could not be read, never an empty list", async () => {
    // An empty list is documented as the honest answer for a card whose history
    // has not started. That is exactly why an outage may not answer it too.
    getCardPrices.mockResolvedValue({ points: [], failed: true });
    const res = await get();
    expect(res.status).toBe(503);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({
      error: "That card's price history could not be read. Try again in a moment.",
    });
  });

  it("refuses a caller the guard refuses", async () => {
    authorise.mockResolvedValue({ status: 401, error: "No.", headers: {} });
    expect((await get()).status).toBe(401);
    expect(getCardPrices).not.toHaveBeenCalled();
  });
});
