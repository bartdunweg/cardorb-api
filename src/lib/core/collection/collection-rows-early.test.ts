import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CollectionRow } from "./collection-row";

/**
 * The rows cache is looked up while the store is asked for the cards version, not after it
 * (cachedRows). The version read is a round trip through Supabase's gateway, 40 ms at the median,
 * and it used to stand in front of the cache read every request made. The lookup starts under the
 * version this instance last found; only a version the store confirms is ever answered from, so a
 * write between two reads is still a miss and never the rows from before it (cardorb-web #360).
 */

const listRows = vi.fn();
const cardsVersion = vi.fn();
/** Every rows lookup, in the order they were started. */
const lookups: string[] = [];
/** The Data Cache, as far as these tests need one: a key and what it holds. */
const entries = new Map<string, unknown>();

vi.mock("next/cache", () => ({
  unstable_cache: (fn: () => Promise<unknown>, key: string[]) => async () => {
    const k = key.join("|");
    if (key[0] === "collection-rows") lookups.push(key[3]!);
    if (entries.has(k)) return entries.get(k);
    const v = await fn();
    entries.set(k, v);
    return v;
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

const { getRows } = await import("./collection");

const row = (id: string, quantity: number): CollectionRow => ({
  id,
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
  quantity,
  condition: null,
  grade: null,
  language: null,
  purchasePrice: null,
  purchaseDate: null,
  notes: null,
  isFavorite: false,
  dexFace: false,
  collectionId: null,
});

/** A version read that answers only when told to. */
const pendingVersion = () => {
  let answer!: (v: number) => void;
  cardsVersion.mockReturnValueOnce(new Promise<number>((r) => (answer = r)));
  return (v: number) => answer(v);
};

let user = 0;
beforeEach(() => {
  vi.clearAllMocks();
  lookups.length = 0;
  entries.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("the rows lookup and the version read", () => {
  it("starts the lookup under the version this instance last found, before the store answers", async () => {
    const me = `me-${user++}`;
    cardsVersion.mockResolvedValueOnce(7);
    listRows.mockResolvedValueOnce([row("a", 1)]);
    await getRows(me, "t");
    lookups.length = 0;

    const answer = pendingVersion();
    const read = getRows(me, "t");
    await new Promise((r) => setTimeout(r, 0));
    // Under the order this replaced, nothing is looked up until the version is back.
    expect(lookups).toEqual(["7"]);
    answer(7);
    expect((await read).rows).toEqual([row("a", 1)]);
    // The early lookup was the one answered from: no second lookup, no second read of the rows.
    expect(lookups).toEqual(["7"]);
    expect(listRows).toHaveBeenCalledTimes(1);
  });

  it("never answers from the guess once a write has moved the version", async () => {
    const me = `me-${user++}`;
    cardsVersion.mockResolvedValueOnce(7);
    listRows.mockResolvedValueOnce([row("a", 1)]);
    await getRows(me, "t");

    // The write: two copies now, and the version moved. The entry under 7 still holds one.
    cardsVersion.mockResolvedValueOnce(8);
    listRows.mockResolvedValueOnce([row("a", 2)]);
    expect((await getRows(me, "t")).rows).toEqual([row("a", 2)]);
  });

  it("does not read the rows for a guess the cache does not hold and the store denies", async () => {
    const me = `me-${user++}`;
    cardsVersion.mockResolvedValueOnce(7);
    listRows.mockResolvedValueOnce([row("a", 1)]);
    await getRows(me, "t");
    entries.clear();
    listRows.mockClear();

    cardsVersion.mockResolvedValueOnce(8);
    listRows.mockResolvedValueOnce([row("a", 2)]);
    expect((await getRows(me, "t")).rows).toEqual([row("a", 2)]);
    // One read, for the version the store gave; the guess under 7 gave up without reading.
    expect(listRows).toHaveBeenCalledTimes(1);
    expect(entries.has(`collection-rows|v4|${me}|7`)).toBe(false);
  });

  it("asks in the old order for a person this instance has not read yet", async () => {
    const me = `me-${user++}`;
    const answer = pendingVersion();
    listRows.mockResolvedValueOnce([row("a", 1)]);
    const read = getRows(me, "t");
    await new Promise((r) => setTimeout(r, 0));
    expect(lookups).toEqual([]);
    answer(3);
    expect((await read).rows).toEqual([row("a", 1)]);
    expect(lookups).toEqual(["3"]);
  });
});
