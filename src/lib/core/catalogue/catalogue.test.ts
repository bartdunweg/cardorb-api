import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The one behaviour worth pinning here: a set the index knows but whose
 * records TCGdex will not deliver must throw rather than come back empty,
 * because the empty answer would be cached for a day. See loadSetCatalogue().
 */

const index = [{ id: "me05", name: "Pitch Black" }];

const { loadSetCatalogue } = await import("./catalogue");

describe("loadSetCatalogue", () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it("throws, rather than caching an empty catalogue, when the index knows the set and none of its records arrive", async () => {
    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/v2/en/sets")) return new Response(JSON.stringify(index), { status: 200 });
      throw new Error("fetch failed");
    }) as typeof fetch;

    await expect(loadSetCatalogue("Pitch Black")).rejects.toThrow(/answered for none/);
  }, 15_000);

  it("resolves to no cards, and caches that, for a set the index does not know", async () => {
    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/v2/en/sets")) return new Response(JSON.stringify(index), { status: 200 });
      throw new Error("fetch failed");
    }) as typeof fetch;

    const cat = await loadSetCatalogue("Not A Set");
    expect(Object.keys(cat.byNumber)).toHaveLength(0);
  }, 15_000);
});
