import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CollectionRow } from "./collection-row";

/**
 * What getCollection() does when TCGdex is down and the store is not: the
 * rows are served without the catalogue, flagged, and nothing is cached.
 * Every other failure is still the 503 the routes turn `failed` into.
 */

const setCatalogue = vi.fn();
const listRows = vi.fn();

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }));
vi.mock("../catalogue/catalogue", () => ({
  setCatalogue: (name: string) => setCatalogue(name),
  pricesFor: async () => new Map(),
  json: async () => null,
}));
// The rate is read before the outage is known; a test that counts fetches must not count it.
vi.mock("../catalogue/rates", () => ({
  fetchUsdToEur: async () => {
    throw new Error("offline");
  },
}));
vi.mock("../catalogue/ptcg", () => ({
  ptcgScan: async () => null,
  ptcgLogo: async () => null,
}));
vi.mock("../catalogue/price-guide", () => ({
  fetchPriceGuide: async () => null,
  guidePrices: () => [],
}));
vi.mock("../../storage/supabase", () => ({
  adminClient: () => ({}),
  serverClient: async () => ({}),
  userClient: () => ({}),
}));
vi.mock("../../storage/postgres", () => ({ listCardPrices: vi.fn() }));
vi.mock("../../storage/collection", () => ({
  listRows: (...a: unknown[]) => listRows(...a),
  listSnapshots: vi.fn(),
  publicProfile: vi.fn(),
}));

const { getCollection, getPublicCollection } = await import("./collection");

const pikachu: CollectionRow = {
  id: "row-1",
  name: "Pikachu",
  number: "058",
  setName: "Base",
  rarity: null,
  gen: null,
  types: [],
  tcgId: null,
  owned: true,
  excluded: false,
  acquiredAt: null,
  finish: null,
  foilPattern: null,
  edition: null,
  quantity: 1,
  condition: null,
  grade: null,
  language: null,
  purchasePrice: null,
  purchaseDate: null,
  notes: null,
  isFavorite: false,
  dexFace: false,
  collectionId: null,
};

const outage = () => {
  const err = new Error("No TCGdex set index, so no set can be resolved: fetch failed");
  err.name = "CatalogueUnavailable";
  return err;
};

/**
 * The other outage: the breaker has already watched TCGdex fail three times and refuses to ask
 * again, so nothing is asked and `CatalogueDown` comes back instead (tcgdex-client.ts). The same
 * thing to everyone here, and for a while not the same thing to this file.
 */
const breakerOpen = () => {
  const err = new Error("TCGdex is down, card base1-73 not asked");
  err.name = "CatalogueDown";
  return err;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  listRows.mockResolvedValue([pikachu]);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: false, status: 404 }) as Response),
  );
});

describe("getCollection during a TCGdex outage", () => {
  it("serves the rows without the catalogue, and says so", async () => {
    setCatalogue.mockRejectedValue(outage());
    const out = await getCollection("me", "t.o.k.e.n");
    expect(out.failed).toBe(false);
    expect(out.catalogueUnavailable).toBe(true);
    expect(out.sets).toHaveLength(1);
    expect(out.sets[0]?.cards[0]).toMatchObject({
      name: "Pikachu",
      image: null,
      tcgId: null,
      price: null,
      owned: true,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  /* On the evening of 2026-09-12 TCGdex was down for half an hour. The first call tripped the
     breaker and every call after it threw this name, which fell past the guard: the collection
     answered 503 and the page said it could not load, while every row sat in the store. */
  it("serves the rows when the breaker is open, not only when TCGdex refused", async () => {
    setCatalogue.mockRejectedValue(breakerOpen());
    const out = await getCollection("me", "t.o.k.e.n");
    expect(out).toMatchObject({ failed: false, catalogueUnavailable: true });
    expect(out.sets[0]?.cards[0]?.name).toBe("Pikachu");
  });

  it("does the same for a public profile", async () => {
    setCatalogue.mockRejectedValue(outage());
    const out = await getPublicCollection("owner-1");
    expect(out).toMatchObject({ failed: false, catalogueUnavailable: true });
    expect(out.sets[0]?.cards[0]?.name).toBe("Pikachu");
  });

  it("still fails when the store is what could not be read", async () => {
    setCatalogue.mockRejectedValue(outage());
    listRows.mockRejectedValue(new Error("PostgREST: connection refused"));
    expect(await getCollection("me", "t.o.k.e.n")).toEqual({ sets: [], failed: true });
  });

  it("still fails on any other error, unflagged", async () => {
    setCatalogue.mockRejectedValue(new Error("TypeError: cannot read byNumber"));
    expect(await getCollection("me", "t.o.k.e.n")).toEqual({ sets: [], failed: true });
  });

  it("carries no flag when the catalogue answered", async () => {
    setCatalogue.mockResolvedValue({
      byNumber: {},
      assetBase: null,
      officialName: "Base Set",
      code: null,
      setHasScans: false,
      logo: null,
      releaseDate: null,
      total: 102,
      prices: {},
    });
    const out = await getCollection("me", "t.o.k.e.n");
    expect(out.failed).toBe(false);
    expect("catalogueUnavailable" in out).toBe(false);
    expect(out.sets[0]?.title).toBe("Base Set");
  });
});
