import { describe, expect, it, vi } from "vitest";
import type { CollectionRow } from "../core/collection/collection-row";

// `imports.ts` reaches a module marked server-only; the guard is a build-time concern, not this test's.
vi.mock("server-only", () => ({}));

/**
 * Rows somebody struck off by hand are counted apart from rows this code could
 * not use. Told together, a person who deselected half their file would be
 * shown an import that half failed.
 *
 * And the collection's own total comes back with the write, because "1,204
 * added" is a number nobody can check on its own. It is the question the
 * `imports` table was given counts for in the first place: "it says 1,204 and
 * I have 1,600".
 */

const card = (name: string): CollectionRow => ({
  id: null,
  name,
  number: "1",
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
  grade: null,
  language: null,
  purchasePrice: null,
  purchaseDate: null,
  notes: null,
  isFavorite: false,
  collectionId: null,
});

/**
 * Counts the cards table, answering each call in turn: createRows counts before
 * and after its insert, and countCards asks once more at the end.
 */
const dbWith = (counts: (number | null)[]) => {
  let call = 0;
  const recorded: Record<string, unknown>[] = [];
  const db = {
    rpc: async () => ({ data: 0, error: null }),
    from: (table: string) =>
      table === "imports"
        ? {
            insert: (row: Record<string, unknown>) => {
              recorded.push(row);
              return {
                select: () => ({ single: async () => ({ data: { id: "i1" }, error: null }) }),
              };
            },
            update: (row: Record<string, unknown>) => {
              recorded.push(row);
              return { eq: async () => ({ error: null }) };
            },
          }
        : {
            select: () => ({
              eq: () => {
                const n = counts[call++];
                return n === null
                  ? { count: null, error: { message: "no" } }
                  : { count: n, error: null };
              },
            }),
            upsert: async () => ({ error: null }),
          },
  };
  return { db, recorded };
};

describe("commit, with rows struck off by hand", () => {
  it("counts them apart, and says what the collection holds afterwards", async () => {
    const { commit } = await import("./imports");
    // 1,598 before, 1,600 after the two rows, and the same 1,600 counted again.
    const { db, recorded } = dbWith([1_598, 1_600, 1_600]);

    const outcome = await commit(
      db as never,
      "u1",
      "csv",
      [card("Pikachu"), card("Charizard")],
      [{ line: 9, why: "no card name" }],
      new Set(),
      undefined,
      3,
    );

    // Two written, one unreadable, three struck off: the file had six lines and
    // `seen` is the file, not what is left of it.
    expect(outcome.seen).toBe(6);
    expect(outcome.excluded).toBe(3);
    expect(outcome.skipped).toBe(1);
    expect(outcome.total).toBe(1_600);

    // The row written down agrees: every line seen, and the struck-off ones
    // among what was not added.
    expect(recorded[0]).toMatchObject({ rows_seen: 6 });
    expect(recorded[1]).toMatchObject({ rows_skipped: 4 });
  });

  it("leaves the total out rather than failing a write that succeeded", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { commit } = await import("./imports");
    // The write's own counts land; the one after it does not.
    const { db } = dbWith([0, 1, null]);

    const outcome = await commit(db as never, "u1", "csv", [card("Pikachu")], [], new Set());

    expect(outcome.total).toBeUndefined();
    expect(outcome.added).toBe(1);
    vi.restoreAllMocks();
  });
});
