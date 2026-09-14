import { beforeEach, describe, expect, it, vi } from "vitest";

/** The movers route: its periods, its refusals, and a store that is down is not "nothing moved". */

const authorise = vi.fn();
vi.mock("@/lib/api/guard", () => ({
  authorise: (...a: unknown[]) => authorise(...a),
  refused: (r: { status?: number }) => "status" in r,
  readHeaders: () => ({}),
}));
vi.mock("@/lib/api/viewer", () => ({
  bearer: (req: Request) => req.headers.get("authorization")?.replace(/^Bearer /, "") ?? null,
}));
const getCollection = vi.fn();
const getCardPrices = vi.fn();
vi.mock("@/lib/core/collection/collection", () => ({
  ALL_READINGS: "2000-01-01",
  getCollection: (...a: unknown[]) => getCollection(...a),
  getCardPrices: (...a: unknown[]) => getCardPrices(...a),
}));

const { GET } = await import("./route");

const VIEWER = { userId: "me-uuid", email: "me@example.com", username: "me" };
const card = {
  key: "base1|4|Charizard",
  name: "Charizard",
  number: "4",
  image: "https://images.cardorb.com/en/base/base1/4/low.webp",
  tcgId: "base1-4",
  variants: [{ owned: true, quantity: 2, finish: null, edition: null }],
};
const ask = (query = "") =>
  GET(
    new Request(`https://api.cardorb.com/v1/movers${query}`, {
      headers: { authorization: "Bearer t" },
    }),
  );

beforeEach(() => {
  vi.resetAllMocks();
  authorise.mockResolvedValue(VIEWER);
  getCollection.mockResolvedValue({ sets: [{ name: "Base Set", cards: [card] }], failed: false });
  getCardPrices.mockResolvedValue({
    failed: false,
    points: [
      { language: "en", tcgId: "base1-4", date: "2026-09-07", market: 300, holo: null },
      { language: "en", tcgId: "base1-4", date: "2026-09-14", market: 320, holo: null },
    ],
  });
});

describe("GET /v1/movers", () => {
  it("answers each card's move per copy and over the copies held", async () => {
    const res = await ask("?days=7");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.down).toEqual([]);
    expect(body.up).toEqual([
      expect.objectContaining({
        tcgId: "base1-4",
        set: "Base Set",
        copies: 2,
        was: 300,
        now: 320,
        change: 20,
        total: 40,
      }),
    ]);
  });

  // neo4-106 is Shining Celebi in English and Lucky Stadium in Japanese.
  it("asks for each card under its set's catalogue", async () => {
    getCollection.mockResolvedValue({
      sets: [
        { name: "Neo Destiny", language: null, cards: [{ ...card, tcgId: "neo4-106" }] },
        { name: "Neo Destiny", language: "ja", cards: [{ ...card, tcgId: "neo4-106" }] },
      ],
      failed: false,
    });
    await ask("?days=7");
    expect(getCardPrices.mock.calls[0]![1]).toEqual([
      { tcgId: "neo4-106", language: "en" },
      { tcgId: "neo4-106", language: "ja" },
    ]);
  });

  it("reads the window the period names, and every reading for all", async () => {
    await ask("?days=7");
    const from7 = getCardPrices.mock.calls[0]![3] as string;
    expect(Date.parse(from7)).toBeGreaterThan(Date.now() - 8 * 86_400_000);
    await ask("?days=all");
    expect(getCardPrices.mock.calls[1]![3]).toBe("2000-01-01");
  });

  it("refuses a period the chart does not have, and a top out of range", async () => {
    expect((await ask("?days=14")).status).toBe(400);
    expect((await ask("?top=0")).status).toBe(400);
    expect((await ask("?top=11")).status).toBe(400);
  });

  it("answers 503, not an empty list, when the readings could not be read", async () => {
    getCardPrices.mockResolvedValue({ failed: true, points: [] });
    expect((await ask()).status).toBe(503);
    getCollection.mockResolvedValue({ sets: [], failed: true });
    expect((await ask()).status).toBe(503);
  });
});
