import { beforeEach, describe, expect, it, vi } from "vitest";

const authorise = vi.fn();
const getCardPrices = vi.fn();

vi.mock("@/lib/api/guard", () => ({
  authorise: (...a: unknown[]) => authorise(...a),
  refused: (r: { status?: number }) => "status" in r,
  readHeaders: () => ({}),
}));
vi.mock("@/lib/api/viewer", () => ({
  bearer: (req: Request) => req.headers.get("authorization")?.replace(/^Bearer /, "") ?? null,
}));
vi.mock("@/lib/core/collection/collection", () => ({
  getCardPrices: (...a: unknown[]) => getCardPrices(...a),
}));

const { GET } = await import("./route");

const get = (tcgId = "base1-4") =>
  GET(
    new Request(`https://cardorb.com/api/v1/cards/${tcgId}/prices`, {
      headers: { authorization: "Bearer t.o.k.e.n" },
    }),
    { params: Promise.resolve({ tcgId }) },
  );

beforeEach(() => {
  vi.clearAllMocks();
  authorise.mockResolvedValue({ userId: "me-uuid", email: "me@example.com", username: "me" });
  getCardPrices.mockResolvedValue([
    { tcgId: "base1-4", date: "2026-09-01", market: 120.5, holo: null },
    { tcgId: "base1-4", date: "2026-09-02", market: 121, holo: 300 },
  ]);
});

describe("GET /api/v1/cards/{tcgId}/prices", () => {
  it("asks for the card's readings with the caller's id and credential", async () => {
    await get();
    expect(getCardPrices).toHaveBeenCalledWith("me-uuid", ["base1-4"], "t.o.k.e.n");
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

  it("hands out this card's points only, whatever wider answer the reader gives", async () => {
    getCardPrices.mockResolvedValue([
      { tcgId: "base1-4", date: "2026-09-01", market: 120.5, holo: null },
      { tcgId: "base1-5", date: "2026-09-01", market: 3, holo: null },
    ]);
    expect(await (await get()).json()).toEqual({
      points: [{ date: "2026-09-01", market: 120.5, holo: null }],
    });
  });

  it("is an empty list for a card with no readings, not a 404", async () => {
    getCardPrices.mockResolvedValue([]);
    const res = await get("nobody-1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ points: [] });
  });

  it("refuses a caller the guard refuses", async () => {
    authorise.mockResolvedValue({ status: 401, error: "No.", headers: {} });
    expect((await get()).status).toBe(401);
    expect(getCardPrices).not.toHaveBeenCalled();
  });
});
