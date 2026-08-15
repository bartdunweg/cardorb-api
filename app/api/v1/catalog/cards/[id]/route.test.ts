import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authorise = vi.fn();
const getCardDetail = vi.fn();

// See app/api/v1/cards/[id]/route.test.ts for why guard.ts is replaced
// wholesale rather than importOriginal()-ed.
vi.mock("../../../../../../lib/api/guard", () => ({
  authorise: (...a: unknown[]) => authorise(...a),
  refused: (r: { status?: number }) => "status" in r,
  readHeaders: () => ({}),
}));
vi.mock("../../../../../../lib/core/cards", () => ({ getCardDetail: (...a: unknown[]) => getCardDetail(...a) }));

const { GET } = await import("./route");

const VIEWER = { userId: "me-uuid", email: "me@example.com", username: "me" };

const request = (id: string) =>
  GET(new Request(`https://cardorb.com/api/v1/catalog/cards/${id}`), { params: Promise.resolve({ id }) });

beforeEach(() => {
  authorise.mockResolvedValue(VIEWER);
});
afterEach(() => getCardDetail.mockClear());

describe("GET /api/v1/catalog/cards/[id]", () => {
  it("refuses when authorisation refuses", async () => {
    authorise.mockResolvedValue({ status: 401, error: "Sign in to see this." });
    const res = await request("sv03-125");
    expect(res.status).toBe(401);
    expect(getCardDetail).not.toHaveBeenCalled();
  });

  it("404s when TCGdex has no such card", async () => {
    getCardDetail.mockResolvedValue(null);
    const res = await request("nope");
    expect(res.status).toBe(404);
  });

  it("returns the full catalogue card", async () => {
    const detail = { id: "sv03-125", localId: "125", name: "Charizard", rarity: "Illustration Rare", types: ["Fire"] };
    getCardDetail.mockResolvedValue(detail);
    const res = await request("sv03-125");
    const { card } = await res.json();
    expect(card).toEqual(detail);
    expect(getCardDetail).toHaveBeenCalledWith("sv03-125");
  });
});
