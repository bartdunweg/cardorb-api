import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A public collection is read for a stranger, and a failed read is a 503 that
 * nothing caches — not an empty collection the CDN hands out for an hour.
 */
const ownerOf = vi.fn();
const getPublicCollection = vi.fn();

vi.mock("@/lib/core/collection/collection", () => ({
  ownerOf: (...a: unknown[]) => ownerOf(...a),
  getPublicCollection: (...a: unknown[]) => getPublicCollection(...a),
}));

const { GET } = await import("./route");

const get = (name = "bart") =>
  GET(new Request(`https://api.cardorb.com/v1/public/${name}/collection`), {
    params: Promise.resolve({ username: name }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  ownerOf.mockResolvedValue({ id: "owner-1", username: "bart", displayName: null, avatarUrl: null , wishlistPublic: false});
  getPublicCollection.mockResolvedValue({ sets: [], failed: false });
});

describe("GET /api/v1/public/{username}/collection", () => {
  it("reads the owner's collection as a public one and caches the answer", async () => {
    const res = await get();
    expect(getPublicCollection).toHaveBeenCalledWith("owner-1");
    expect(res.status).toBe(200);
    // A minute at the CDN and no serving while stale: turning a profile
    // private is only as quick as this window, since nothing purges the host.
    expect(res.headers.get("cache-control")).toBe("public, max-age=0, s-maxage=60");
    expect(await res.json()).toEqual({ sets: [] });
  });

  it("answers a failed walk with a 503 that nothing may cache", async () => {
    getPublicCollection.mockResolvedValue({ sets: [], failed: true });
    const res = await get();
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toMatchObject({ error: expect.any(String) });
  });

  it("is a 404 for a profile that is not public", async () => {
    ownerOf.mockResolvedValue(null);
    expect((await get("nobody")).status).toBe(404);
    expect(getPublicCollection).not.toHaveBeenCalled();
  });
});
