import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authorise = vi.fn();
const json = vi.fn();

// See app/api/v1/cards/[id]/route.test.ts for why guard.ts is replaced
// wholesale rather than importOriginal()-ed.
vi.mock("../../../../../lib/api/guard", () => ({
  authorise: (...a: unknown[]) => authorise(...a),
  refused: (r: { status?: number }) => "status" in r,
  readHeaders: () => ({}),
}));
vi.mock("../../../../../lib/core/catalogue", () => ({ json: (...a: unknown[]) => json(...a) }));

const { GET } = await import("./route");

const VIEWER = { userId: "me-uuid", email: "me@example.com", username: "me" };

const request = () => GET(new Request("https://cardorb.com/api/v1/catalog/sets"));

beforeEach(() => {
  authorise.mockResolvedValue(VIEWER);
  json.mockResolvedValue([
    { id: "swsh12.5", name: "Crown Zenith" },
    { id: "base1", name: "Base" },
  ]);
});
afterEach(() => json.mockClear());

describe("GET /api/v1/catalog/sets", () => {
  it("refuses when authorisation refuses", async () => {
    authorise.mockResolvedValue({ status: 401, error: "Sign in to see this." });
    const res = await request();
    expect(res.status).toBe(401);
    expect(json).not.toHaveBeenCalled();
  });

  it("returns the sets sorted by name", async () => {
    const res = await request();
    const { sets } = await res.json();
    expect(sets).toEqual([
      { id: "base1", name: "Base" },
      { id: "swsh12.5", name: "Crown Zenith" },
    ]);
  });

  it("answers 502 when TCGdex is unreachable", async () => {
    json.mockRejectedValue(new Error("boom"));
    const res = await request();
    expect(res.status).toBe(502);
  });
});
