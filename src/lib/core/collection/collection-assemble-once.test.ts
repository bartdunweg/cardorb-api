import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CollectionRow } from "./collection-row";

/**
 * Two requests for the same collection on one instance share one join.
 *
 * The app's first screen asks /cards, /stats and /folders at once. On a cold instance each missed
 * the ten-minute memo and built the whole collection side by side, every price read twice.
 */

const listRows = vi.fn();
/* Offline: every join fails, which is also what shows a failure is not handed on. */
const setCatalogue = vi.fn(async (..._: unknown[]) => {
  const err = new Error("offline");
  err.name = "CatalogueUnavailable";
  throw err;
});
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
  setCatalogue: (...a: unknown[]) => setCatalogue(...a),
  pricesFor: async () => new Map(),
  json: async () => null,
}));
vi.mock("../catalogue/rates", () => ({
  fetchUsdToEur: async () => {
    throw new Error("offline");
  },
}));
vi.mock("../catalogue/ptcg", () => ({ ptcgScan: async () => null, ptcgLogo: async () => null }));
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

const { assembleFor } = await import("./collection");

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

afterEach(() => {
  vi.restoreAllMocks();
});

describe("assemble", () => {
  it("joins a build already under way, and builds again once that one has failed", async () => {
    listRows.mockResolvedValue([pikachu]);
    cardsVersion.mockResolvedValue(7);
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    const both = await Promise.allSettled([
      assembleFor("two-at-once", {} as SupabaseClient),
      assembleFor("two-at-once", {} as SupabaseClient),
    ]);

    expect(both.map((r) => r.status)).toEqual(["rejected", "rejected"]);
    expect(setCatalogue).toHaveBeenCalledTimes(1);
    const lines = info.mock.calls.map((c) => String(c[0]));
    expect(lines.filter((l) => l.startsWith("[timing] cache assemble joined"))).toHaveLength(1);

    // The failed build is gone: the next request asks again rather than being handed the failure.
    await expect(assembleFor("two-at-once", {} as SupabaseClient)).rejects.toThrow("offline");
    expect(setCatalogue).toHaveBeenCalledTimes(2);
  });
});
