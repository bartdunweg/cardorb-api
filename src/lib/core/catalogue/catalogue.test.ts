import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The one behaviour worth pinning here: a set the index knows but whose
 * records TCGdex will not deliver must throw rather than come back empty,
 * because the empty answer would be cached for a day. See loadSetCatalogue().
 */

const index = [{ id: "me05", name: "Pitch Black", cardCount: { official: 120, total: 150 } }];

/** A set record as TCGdex hands one over, with one card that has a scan. */
const record = (cards: { id: string; localId: string; name: string; image?: string }[]) => ({
  id: "me05",
  name: "Pitch Black",
  logo: "https://assets.tcgdex.net/en/me/me05/logo",
  cardCount: { official: 120, total: 150 },
  cards,
});

const CARD = { id: "me05-001", localId: "001", name: "Bulbasaur", image: "img/001" };

/** The index, the set record and the HEAD on the first scan, each answered as told. */
const serve = (set: unknown, scan: { status: number }) =>
  vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("/v2/en/sets")) return new Response(JSON.stringify(index), { status: 200 });
    if (url.includes("/v2/en/sets/")) return new Response(JSON.stringify(set), { status: 200 });
    return new Response(null, { status: scan.status });
  }) as typeof fetch;

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

  it("names the outage when the index itself cannot be fetched, so the collection can be served without it", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("fetch failed");
    }) as typeof fetch;

    await expect(loadSetCatalogue("Pitch Black")).rejects.toMatchObject({
      name: "CatalogueUnavailable",
      message: expect.stringMatching(/No TCGdex set index/),
    });
  }, 15_000);

  it("names the outage the same way when the index knows the set and none of its records arrive", async () => {
    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/v2/en/sets")) return new Response(JSON.stringify(index), { status: 200 });
      throw new Error("fetch failed");
    }) as typeof fetch;

    await expect(loadSetCatalogue("Pitch Black")).rejects.toMatchObject({
      name: "CatalogueUnavailable",
    });
  }, 15_000);

  it("throws rather than caching a set the index counts in the hundreds and the record answers with none", async () => {
    // The quieter half of the same failure: a 200 whose `cards` is empty looks like a fact, so
    // it was kept for a day as "this set has no cards" - no scan, no price, no catalogue id.
    globalThis.fetch = serve(record([]), { status: 200 });

    await expect(loadSetCatalogue("Pitch Black")).rejects.toMatchObject({
      name: "CatalogueUnavailable",
      message: expect.stringMatching(/answered with none/),
    });
  }, 15_000);

  it("keeps a set the index itself counts at zero: announced and not filled in is the truth", async () => {
    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/v2/en/sets")) {
        return new Response(JSON.stringify([{ id: "me05", name: "Pitch Black" }]), { status: 200 });
      }
      if (url.includes("/v2/en/sets/")) {
        return new Response(JSON.stringify({ id: "me05", name: "Pitch Black", cards: [] }), {
          status: 200,
        });
      }
      return new Response(null, { status: 404 });
    }) as typeof fetch;

    const cat = await loadSetCatalogue("Pitch Black");
    expect(Object.keys(cat.byNumber)).toHaveLength(0);
  }, 15_000);

  it("keeps the set's scans on when the picture host is having a bad minute", async () => {
    // One HEAD decides it for the whole set and the answer is cached for a day: on 2026-09-12
    // a 502 on that one request drew 207 empty tiles for set 151 while every file was served.
    globalThis.fetch = serve(record([CARD]), { status: 502 });

    expect((await loadSetCatalogue("Pitch Black")).setHasScans).toBe(true);
  }, 15_000);

  it("still says a set has no scans when the file really is not there", async () => {
    // What the probe is for: TCGdex publishes the record before the artwork, and every image
    // URL of a just-announced set is a 404 that carries no cache-control.
    globalThis.fetch = serve(record([CARD]), { status: 404 });

    expect((await loadSetCatalogue("Pitch Black")).setHasScans).toBe(false);
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

/**
 * The other half of the file: which TCGdex sets a collection's own set name
 * covers. Every case here was found by running a real export's 68 set names
 * through it — three of them were matching the wrong set silently, which is
 * worse than matching nothing, because a card drawn from the wrong set has art
 * and a price and no sign that either belongs to something else.
 */
const { resolveSetIds } = await import("./catalogue");

const SETS = [
  { id: "ex3", name: "Dragon" },
  { id: "ex15", name: "Dragon Frontiers" },
  { id: "bw6", name: "Dragons Exalted" },
  { id: "dv1", name: "Dragon Vault" },
  { id: "swsh1", name: "Sword & Shield" },
  { id: "swsh10", name: "Astral Radiance" },
  { id: "swsh10tg", name: "Astral Radiance Trainer Gallery" },
  { id: "swshp", name: "SWSH Black Star Promos" },
  { id: "xy1", name: "XY" },
  { id: "xyp", name: "XY Black Star Promos" },
  { id: "tk-xy-n", name: "XY trainer Kit (Noivern)" },
  { id: "tk-ex-p", name: "EX trainer Kit 2 (Plusle)" },
] as never;

describe("resolveSetIds", () => {
  it("keeps a set's own galleries and vaults, which share its id", () => {
    expect(resolveSetIds("Astral Radiance", SETS)).toEqual(["swsh10", "swsh10tg"]);
  });

  it("does not let a set swallow the ones whose name merely starts the same", () => {
    // ex15, bw6 and dv1 all begin "Dragon"; none is filed under ex3.
    expect(resolveSetIds("Dragon", SETS)).toEqual(["ex3"]);
    expect(resolveSetIds("XY", SETS)).toEqual(["xy1"]);
  });

  it("does not let a low-numbered set swallow its higher-numbered siblings", () => {
    // swsh10's id starts with swsh1, but its name is not Sword & Shield's.
    expect(resolveSetIds("Sword & Shield", SETS)).toEqual(["swsh1"]);
  });

  it("takes the longest overlap, not the first one listed", () => {
    // "EX Dragon Frontiers" contains "Dragon" too, and Dragon is listed first.
    expect(resolveSetIds("EX Dragon Frontiers", SETS)).toEqual(["ex15"]);
    expect(resolveSetIds("EX Dragon", SETS)).toEqual(["ex3"]);
  });

  it("sends an export's promo set names to the promos, not to the era's base set", () => {
    expect(resolveSetIds("Sword & Shield Promos", SETS)).toEqual(["swshp"]);
    expect(resolveSetIds("XY Promos", SETS)).toEqual(["xyp"]);
  });

  it("knows the trainer kits an export names after the product", () => {
    // TCGdex files these by the deck's Pokemon and a series number. Nothing
    // bridges that to "Plusle Half Deck" but the table.
    expect(resolveSetIds("EX Trainer Kit: Plusle Half Deck", SETS)).toEqual(["tk-ex-p"]);
  });

  it("answers nothing for a set no catalogue knows", () => {
    expect(resolveSetIds("Some Set That Does Not Exist", SETS)).toEqual([]);
  });
});
