import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createRows, ImportFailed } from "./postgres";

/*
 * An import writes in batches with no transaction around them. A batch refused must take back
 * the batches before it, or the answer "could not be finished" is a lie and a second run doubles
 * them; and what a file says a copy cost must reach the row.
 */

const row = (i: number) =>
  ({
    id: null,
    name: `Card ${i}`,
    number: String(i),
    setName: "Base Set",
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
    grade: "PSA 9",
    language: null,
    purchasePrice: 4.5,
    purchaseDate: "2024-01-02",
    notes: null,
    isFavorite: true,
    dexFace: false,
    collectionId: null,
  }) as never;

function fakeDb(refuseBatch: number | null) {
  const batches: Record<string, unknown>[][] = [];
  const deletes: { like: [string, string] | null; eqs: [string, unknown][] }[] = [];
  const db = {
    from: () => {
      const del = { like: null as [string, string] | null, eqs: [] as [string, unknown][] };
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (column: string, value: unknown) => {
          del.eqs.push([column, value]);
          return column === "user_id" && !deletes.includes(del)
            ? Object.assign(Promise.resolve({ count: 0, error: null }), chain)
            : chain;
        },
        upsert: async (batch: Record<string, unknown>[]) => {
          batches.push(batch);
          return { error: batches.length - 1 === refuseBatch ? { message: "refused" } : null };
        },
        delete: () => {
          deletes.push(del);
          return chain;
        },
        like: async (column: string, pattern: string) => {
          del.like = [column, pattern];
          return { error: null };
        },
      };
      return chain;
    },
    rpc: vi.fn(async () => ({ data: 0, error: null })),
  } as unknown as SupabaseClient;
  return { db, batches, deletes };
}

describe("createRows", () => {
  it("takes back the batches already written when a later one is refused", async () => {
    const { db, batches, deletes } = fakeDb(1);
    const err = await createRows(db, "me", [row(1), row(2), row(3)], "csv", 2).catch((e) => e);
    expect(err).toBeInstanceOf(ImportFailed);
    expect((err as ImportFailed).undone).toBe(true);
    const mark = String(batches[0]![0]!.source_id).split(":")[0];
    expect(deletes).toHaveLength(1);
    expect(deletes[0]!.like).toEqual(["source_id", `${mark}:%`]);
    expect(deletes[0]!.eqs).toContainEqual(["user_id", "me"]);
    // Every row of the run carries the same mark, and no two rows the same id.
    const ids = batches.flat().map((b) => String(b.source_id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith(`${mark}:`))).toBe(true);
  });

  it("writes what a copy cost, its grade, date and star", async () => {
    const { db, batches } = fakeDb(null);
    await createRows(db, "me", [row(1)], "csv");
    expect(batches[0]![0]).toMatchObject({
      purchase_price: 4.5,
      purchase_date: "2024-01-02",
      grade: "PSA 9",
      is_favorite: true,
    });
  });
});
