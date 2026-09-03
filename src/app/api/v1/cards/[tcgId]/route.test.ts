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

const { GET } = await import("./route");

const get = (tcgId = "sv03-125") =>
  GET(new Request(`https://api.cardorb.com/v1/cards/${tcgId}`), {
    params: Promise.resolve({ tcgId }),
  });

beforeEach(() => {
  authorise.mockResolvedValue({ userId: "me-uuid", email: "me@example.com", username: "me" });
  getCardDetail.mockResolvedValue({ id: "sv03-125", name: "Charizard" });
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
    expect((await res.json()).name).toBe("Charizard");
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
