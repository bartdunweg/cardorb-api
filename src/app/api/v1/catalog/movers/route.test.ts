import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authorise = vi.fn();
const getMarketMovers = vi.fn();
vi.mock("@/lib/api/guard", () => ({
  authoriseOpen: (...a: unknown[]) => authorise(...a),
  refused: (r: { status?: number } | null) => !!r && "status" in r,
  /* Distinguishable on purpose, as every open route's tests are since #584: mocked as the same
     set, a cacheable refusal passes review unseen, which is how the shelf's 502 once did. */
  readHeaders: () => ({ "Cache-Control": "private, no-store" }),
  openReadHeaders: () => ({ "Cache-Control": "public, max-age=0, s-maxage=60" }),
}));
vi.mock("@/lib/core/collection/collection", () => ({
  getMarketMovers: () => getMarketMovers(),
}));

const { GET } = await import("./route");
const get = (headers: Record<string, string> = {}) =>
  GET(new Request("https://api.cardorb.com/api/v1/catalog/movers", { headers }));

const MOVER = {
  tcgId: "base1-4",
  printing: "unlimited-holofoil",
  name: "Charizard",
  setName: "Base",
  number: "4",
  printedNumber: "4",
  image: "https://images.cardorb.com/en/base1/4/low.webp",
  was: 400,
  now: 408,
  change: 8,
  pct: 0.02,
  from: "2026-09-15",
  to: "2026-09-22",
};

beforeEach(() => {
  authorise.mockResolvedValue(null);
  getMarketMovers.mockResolvedValue({ up: [MOVER], down: [], failed: false });
});
afterEach(() => vi.clearAllMocks());

describe("GET /api/v1/catalog/movers", () => {
  it("answers a reader who offered no credential, with the open window", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ up: [MOVER], down: [] });
    expect(res.headers.get("cache-control")).toBe("public, max-age=0, s-maxage=60");
  });

  /* Nothing in it is the reader's: the whole catalogue's movers, not a collection's. */
  it("answers a named reader the same body", async () => {
    const stranger = await (await get()).json();
    authorise.mockResolvedValue({ userId: "me-uuid", email: "me@example.com", username: "me" });
    const named = await get({ authorization: "Bearer t.o.k.e.n" });
    expect(named.status).toBe(200);
    expect(await named.json()).toEqual(stranger);
  });

  it("sends a credential that does not verify its refusal, private, and reads nothing", async () => {
    authorise.mockResolvedValue({ status: 401, error: "Sign in to see this.", headers: {} });
    const res = await get({ authorization: "Bearer stale" });
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(getMarketMovers).not.toHaveBeenCalled();
  });

  it("sends the limiter's refusal private, with its Retry-After", async () => {
    authorise.mockResolvedValue({
      status: 429,
      error: "Too many.",
      headers: { "Retry-After": "7" },
    });
    const res = await get();
    expect(res.status).toBe(429);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("retry-after")).toBe("7");
  });

  /* An empty list reads as "nothing moved". A market that could not be read is not that, and held
     by a shared cache it would tell every visitor so for a minute. */
  it("answers a read that failed as a 503, uncached, never as an empty list", async () => {
    getMarketMovers.mockResolvedValue({ up: [], down: [], failed: true });
    const res = await get();
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toHaveProperty("error");
  });

  it("answers a market where nothing moved as two empty lists, with the open window", async () => {
    getMarketMovers.mockResolvedValue({ up: [], down: [], failed: false });
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ up: [], down: [] });
  });
});
