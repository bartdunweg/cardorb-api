import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { copyRow } from "./postgres";
import type { CopyChanges } from "@/lib/core/collection/collection-row";

/**
 * What a foil looks like is accepted by the API and used to be thrown away.
 *
 * `COPY_KEYS` lists `foilPattern`, so `POST …/copies` with `{"foilPattern":"cosmos"}` answered
 * 201 — and `columnsFor` mapped nine keys, none of them that one. The copy came back with
 * `foilPattern: null`, which in this schema means "nobody has said" rather than "plain". A
 * stated fact became a missing one, with no error anywhere.
 */
describe("copyRow and the foil pattern", () => {
  const source = {
    id: "src-1",
    user_id: "u1",
    name: "Fomantis",
    number: "085",
    set_name: "Pitch Black",
    rarity: null,
    gen: null,
    types: [],
    owned: true,
    excluded: false,
    finish: "holo",
    foil_pattern: "cosmos",
    quantity: 3,
    condition: null,
    grade: null,
    language: null,
    purchase_price: null,
    purchase_date: null,
    notes: null,
    is_favorite: false,
    collection_id: null,
    acquired_at: null,
    source: "manual",
    source_id: null,
    created_at: null,
    updated_at: null,
    image_url: null,
    tcg_id: null,
  };

  const dbThatCaptures = (written: Record<string, unknown>[]) =>
    ({
      // The copy folds into a row of its kind afterwards; none is, so the fold hands it back.
      rpc: async () => ({ data: [{ ...source, ...written[0], id: "new-1" }], error: null }),
      from: () => ({
        select: () => ({
          eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: source, error: null }) }) }),
        }),
        insert: (row: Record<string, unknown>) => {
          written.push(row);
          return {
            select: () => ({
              single: async () => ({ data: { ...source, ...row, id: "new-1" }, error: null }),
            }),
          };
        },
      }),
    }) as unknown as SupabaseClient;

  it("carries the source's pattern to the copy", async () => {
    const written: Record<string, unknown>[] = [];
    await copyRow(dbThatCaptures(written), "u1", "src-1", 1, {} as CopyChanges);
    expect(written[0]).toHaveProperty("foil_pattern", "cosmos");
  });

  it("writes a pattern the caller stated", async () => {
    const written: Record<string, unknown>[] = [];
    await copyRow(dbThatCaptures(written), "u1", "src-1", 1, {
      foilPattern: "starlight",
    } as CopyChanges);
    expect(written[0]).toHaveProperty("foil_pattern", "starlight");
  });
});
