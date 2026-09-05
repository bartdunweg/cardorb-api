import { beforeEach, describe, expect, it, vi } from "vitest";

const ownerOf = vi.fn();
vi.mock("@/lib/core/collection/collection", () => ({ ownerOf: (...a: unknown[]) => ownerOf(...a) }));

const { GET } = await import("./route");

const get = (name = "bart") =>
  GET(new Request(`https://api.cardorb.com/v1/public/${name}/profile`), {
    params: Promise.resolve({ username: name }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  ownerOf.mockResolvedValue({
    id: "u",
    username: "bart",
    displayName: "Bart",
    avatarUrl: "/a.png",
    wishlistPublic: true,
  });
});

describe("GET /api/v1/public/{username}/profile", () => {
  it("prints the name and the picture, and nothing else about the person", async () => {
    const res = await get();
    expect(await res.json()).toEqual({
      username: "bart",
      displayName: "Bart",
      avatarUrl: "/a.png",
      wishlistPublic: true,
    });
    expect(res.headers.get("cache-control")).toBe("public, max-age=0, s-maxage=60");
  });

  it("is a 404 for a profile that is not public", async () => {
    ownerOf.mockResolvedValue(null);
    expect((await get("nobody")).status).toBe(404);
  });
});
