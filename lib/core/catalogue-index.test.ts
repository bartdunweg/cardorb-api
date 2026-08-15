import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * refreshCatalogueIndex() is the write side (walks TCGdex, upserts rows) and
 * searchCatalogue() is the read side (queries what got written). Both are
 * exercised against a fake Supabase client rather than a real one — the thing
 * worth proving here is the shape of the calls this file makes, not
 * PostgREST itself.
 */

const json = vi.fn();
const fetchSet = vi.fn();

vi.mock("./tcgdex-client", () => ({
  json: (...a: unknown[]) => json(...a),
  fetchSet: (...a: unknown[]) => fetchSet(...a),
}));

// A minimal stand-in for the chain catalogue-index.ts actually calls:
// .from(table).upsert(rows) / .delete().lt(col, val) / .select(...).or(...).limit(...).eq(...)
function fakeTable(state: { upserts: unknown[][]; deletedBefore: string[] }) {
  const query: Record<string, unknown> = {};
  query.select = () => query;
  query.or = () => query;
  query.limit = () => query;
  query.eq = () => query;
  query.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
  return {
    upsert: (rows: unknown[]) => {
      state.upserts.push(rows);
      return { error: null };
    },
    delete: () => ({
      lt: (_col: string, val: string) => {
        state.deletedBefore.push(val);
        return { error: null };
      },
    }),
    select: () => query,
  };
}

const adminState = { upserts: [] as unknown[][], deletedBefore: [] as string[] };
vi.mock("../storage/supabase", () => ({
  adminClient: () => ({ from: () => fakeTable(adminState) }),
  readClient: () => ({ from: () => fakeTable(adminState) }),
}));

const { refreshCatalogueIndex, searchCatalogue } = await import("./catalogue-index");

afterEach(() => {
  json.mockClear();
  fetchSet.mockClear();
  adminState.upserts = [];
  adminState.deletedBefore = [];
});

describe("refreshCatalogueIndex", () => {
  it("walks every set once and upserts every card it finds", async () => {
    json.mockResolvedValue([
      { id: "base1", name: "Base" },
      { id: "swsh1", name: "Sword & Shield" },
    ]);
    fetchSet.mockImplementation(async (id: string) => ({
      id,
      name: id === "base1" ? "Base" : "Sword & Shield",
      logo: `https://img/${id}/logo`,
      cards: [{ id: `${id}-4`, localId: "4", name: "Charizard", image: `https://img/${id}/4` }],
    }));

    const result = await refreshCatalogueIndex();

    expect(fetchSet).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ sets: 2, cards: 2 });
    const rows = adminState.upserts.flat() as { id: string; set_id: string }[];
    expect(rows.map((r) => r.id).sort()).toEqual(["base1-4", "swsh1-4"]);
    // Every row upserted gets pruned away only if it wasn't refreshed —
    // a run that touches every id should still issue the prune, just with a
    // cutoff older than every row it just wrote.
    expect(adminState.deletedBefore).toHaveLength(1);
  });

  it("skips a set TCGdex refused rather than failing the whole run", async () => {
    json.mockResolvedValue([{ id: "base1", name: "Base" }]);
    fetchSet.mockResolvedValue(null);

    const result = await refreshCatalogueIndex();
    expect(result).toEqual({ sets: 0, cards: 0 });
  });
});

describe("searchCatalogue", () => {
  it("strips characters that would break the or() filter syntax", async () => {
    // Regression guard: a query containing "," or "(" must not throw when
    // folded into `name.ilike.%...%,local_id.ilike.%...%`.
    await expect(searchCatalogue("char,(a)")).resolves.toEqual([]);
  });
});
