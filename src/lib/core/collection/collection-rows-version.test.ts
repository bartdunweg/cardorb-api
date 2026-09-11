import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CollectionRow } from "./collection-row";

/**
 * The rows cache is keyed on the store's count of writes (profiles.cards_version), so a read
 * that started before a write and finished after it stores under a key nothing asks for again.
 * The tag alone could not say that: two presses on a count within a second left the list on
 * the rows from before the second (cardorb-web #360). A store that cannot say a version — no
 * migration yet, a refused read — keeps the key it had, with the tag doing what it can.
 */

const listRows = vi.fn();
const cardsVersion = vi.fn();
const keys: unknown[][] = [];

vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown, key: unknown[]) => {
    keys.push(key);
    return fn;
  },
  revalidateTag: vi.fn(),
}));
vi.mock("../catalogue/catalogue", () => ({
  setCatalogue: async () => {
    const err = new Error("offline");
    err.name = "CatalogueUnavailable";
    throw err;
  },
  pricesFor: async () => new Map(),
  json: async () => null,
}));
vi.mock("../catalogue/rates", () => ({
  fetchUsdToEur: async () => {
    throw new Error("offline");
  },
}));
vi.mock("../catalogue/ptcg", () => ({ ptcgScan: async () => null, ptcgLogo: async () => null }));
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
  cardsVersion: (...a: unknown[]) => cardsVersion(...a),
  listSnapshots: vi.fn(),
  publicProfile: vi.fn(),
}));

const { getCollection } = await import("./collection");

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
  quantity: 1,
  condition: null,
  grade: null,
  language: null,
  purchasePrice: null,
  purchaseDate: null,
  notes: null,
  isFavorite: false,
  collectionId: null,
};

const rowsKey = () => keys.find((k) => k[0] === "collection-rows");

beforeEach(() => {
  vi.clearAllMocks();
  keys.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
  listRows.mockResolvedValue([pikachu]);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: false, status: 404 }) as Response),
  );
});

describe("the rows cache key", () => {
  it("carries the store's cards version, asked for this person before the rows", async () => {
    cardsVersion.mockResolvedValue(7);
    await getCollection("me", "t.o.k.e.n");
    expect(cardsVersion).toHaveBeenCalledWith("me", expect.anything());
    expect(rowsKey()).toEqual(["collection-rows", "v2", "me", "7"]);
  });

  it("moves with the version, so a write is a miss and never a stale fill", async () => {
    cardsVersion.mockResolvedValue(7);
    await getCollection("me", "t.o.k.e.n");
    const before = rowsKey();
    keys.length = 0;
    cardsVersion.mockResolvedValue(8);
    await getCollection("me", "t.o.k.e.n");
    expect(before?.[3]).toBe("7");
    expect(rowsKey()?.[3]).toBe("8");
  });

  it("stays the key it was when the store cannot say a version", async () => {
    cardsVersion.mockResolvedValue(null);
    await getCollection("me", "t.o.k.e.n");
    expect(rowsKey()).toEqual(["collection-rows", "v2", "me", "-"]);
  });

  it("does not let a failed version read take the rows down with it", async () => {
    cardsVersion.mockRejectedValue(new Error("column cards_version does not exist"));
    const got = await getCollection("me", "t.o.k.e.n");
    expect(got.failed).toBe(false);
    expect(rowsKey()).toEqual(["collection-rows", "v2", "me", "-"]);
  });
});
