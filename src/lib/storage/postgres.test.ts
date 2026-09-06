import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteRow, listRows, listValueSnapshots, updateRow } from "./postgres";

/**
 * Whose rows, asked out loud.
 *
 * This guards a bug that has now happened three times in this codebase, each
 * time wearing the same disguise: an empty collection, which is an ordinary
 * answer and so never looks like a fault.
 *
 * Once it was getCards() taking a default user id and handing Postgres the
 * string "owner". Once it was the cache key carrying the user while the query
 * did not, so a brand new account was handed 1,645 cards belonging to somebody
 * with a public profile. Once it was the public link's preview image, drawing a
 * collection that held nothing.
 *
 * Row level security is not what catches this. The policy that lets a public
 * profile be read by strangers judges a signed-in stranger by the same rule and
 * answers yes, correctly. The application still has to say whose collection it
 * wants, and this is the assertion that it does.
 */

/**
 * Just enough of the query builder to record what was asked.
 *
 * Thenable rather than promise-returning, because the real code calls .eq()
 * *after* .range() — `q = q.eq("user_id", …)` reassigns the builder — so a fake
 * whose range() returns a promise breaks on a method the promise does not have.
 * Awaiting is the last thing that happens, so `then` is where the answer lives.
 */
function fakeDb(data: unknown[] = []) {
  const calls: { column: string; value: unknown }[] = [];
  const orders: { column: string; ascending: boolean | undefined }[] = [];
  const chain: Record<string, unknown> = {
    select: () => chain,
    order: (column: string, opts?: { ascending?: boolean }) => {
      orders.push({ column, ascending: opts?.ascending });
      return chain;
    },
    range: () => chain,
    eq: (column: string, value: unknown) => {
      calls.push({ column, value });
      return chain;
    },
    then: (resolve: (v: unknown) => unknown) => resolve({ data, error: null, count: data.length }),
  };
  return { db: { from: () => chain } as unknown as SupabaseClient, calls, orders };
}

describe("listRows", () => {
  it("narrows to the person it was given", async () => {
    const { db, calls } = fakeDb();
    await listRows(db, "11111111-1111-1111-1111-111111111111");
    expect(calls).toContainEqual({
      column: "user_id",
      value: "11111111-1111-1111-1111-111111111111",
    });
  });

  it("asks for everything readable when nobody is named", async () => {
    // The public page's case, and the reason the argument is optional rather
    // than required: there the policies are the whole filter, because the
    // caller is a stranger and "everything readable" is exactly one shared
    // collection. Passing a viewer here would return their own rows instead.
    const { db, calls } = fakeDb();
    await listRows(db);
    expect(calls.find((c) => c.column === "user_id")).toBeUndefined();
  });

  it("does not confuse two people", async () => {
    const a = fakeDb();
    const b = fakeDb();
    await listRows(a.db, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    await listRows(b.db, "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    expect(a.calls[0]?.value).toBe("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    expect(b.calls[0]?.value).toBe("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
  });
});

const snapshot = (over: Record<string, unknown> = {}) => ({
  snapshot_date: "2026-08-06",
  value_cents: 3_988_700,
  cards: 1524,
  priced: 1211,
  unpriced: 313,
  ...over,
});

describe("listValueSnapshots", () => {
  /**
   * The same assertion the block above exists for, on the table where getting
   * it wrong is worse. cards_read has a public branch, so a query that forgets
   * to say whose can only ever return a collection somebody chose to publish.
   * value_snapshots_own has no such branch, so the only thing standing between
   * two accounts' net worth is the policy — and this line, which is the
   * application saying it out loud rather than trusting the wall.
   */
  it("narrows to the person it was given", async () => {
    const { db, calls } = fakeDb([snapshot()]);
    await listValueSnapshots(db, "11111111-1111-1111-1111-111111111111");
    expect(calls).toContainEqual({
      column: "user_id",
      value: "11111111-1111-1111-1111-111111111111",
    });
  });

  it("asks for them oldest first", async () => {
    // The card treats snapshots[0] as where the record starts — "since December
    // 2024" is that row's date — and reverses nothing.
    const { db, orders } = fakeDb([snapshot()]);
    await listValueSnapshots(db, "u");
    expect(orders).toEqual([{ column: "snapshot_date", ascending: true }]);
  });

  it("hands back whole euros, not the cents the table keeps", async () => {
    const { db } = fakeDb([
      snapshot({ snapshot_date: "2024-12-30", value_cents: 1_563_449 }),
      snapshot(),
    ]);
    const out = await listValueSnapshots(db, "u");
    expect(out).toEqual([
      { date: "2024-12-30", value: 15_634, cards: 1524, priced: 1211, unpriced: 313 },
      { date: "2026-08-06", value: 39_887, cards: 1524, priced: 1211, unpriced: 313 },
    ]);
  });

  it("answers with nothing for an account that has never been snapshotted", async () => {
    const { db } = fakeDb();
    expect(await listValueSnapshots(db, "u")).toEqual([]);
  });
});

/**
 * A write that reached no row says so instead of failing or pretending, and
 * every write names whose row it means.
 *
 * Row level security turns "somebody else's card" into "no such row": the
 * query is well formed and simply matches nothing. `.single()` made that a
 * PostgREST error the route answered as a 502, and an unchecked delete
 * answered 200 for a card it never touched. Both are the caller's mistake, and
 * the store has to hand it back as a plain answer so the route can say 404.
 *
 * The user_id clause is the rule in .claude/rules/catalogue-and-collection.md:
 * RLS is the wall, the query still says whose rows it wants.
 */
function fakeWriteDb(returned: unknown[]) {
  const calls: { column: string; value: unknown }[] = [];
  const chain: Record<string, unknown> = {
    update: () => chain,
    delete: () => chain,
    eq: (column: string, value: unknown) => {
      calls.push({ column, value });
      return chain;
    },
    select: () => chain,
    maybeSingle: async () => ({ data: returned[0] ?? null, error: null }),
    then: (resolve: (v: unknown) => unknown) => resolve({ data: returned, error: null }),
  };
  return { db: { from: () => chain } as unknown as SupabaseClient, calls };
}

const ME = "22222222-2222-2222-2222-222222222222";
const ROW = "11111111-1111-1111-1111-111111111111";

const record = {
  id: ROW,
  name: "Pikachu",
  number: "25",
  set_name: "Base Set",
  rarity: "Common",
  gen: "Base",
  types: ["Lightning"],
  owned: true,
  excluded: false,
  acquired_at: "2026-01-02T00:00:00.000Z",
  finish: "holo",
  quantity: 2,
  condition: "NM",
  grade: null,
  language: null,
  purchase_price: 4.5,
  purchase_date: "2026-01-02",
  notes: "first pull",
  is_favorite: true,
  collection_id: null,
};

describe("updateRow", () => {
  it("hands the matched row back in the collection's own shape", async () => {
    const { db } = fakeWriteDb([record]);
    const row = await updateRow(db, ME, ROW, { isFavorite: true });
    expect(row).toMatchObject({
      id: ROW,
      name: "Pikachu",
      setName: "Base Set",
      finish: "holo",
      quantity: 2,
      purchasePrice: 4.5,
      isFavorite: true,
      collectionId: null,
    });
  });

  it("answers null, not an error, when no row matched", async () => {
    const { db } = fakeWriteDb([]);
    expect(await updateRow(db, ME, ROW, { isFavorite: true })).toBeNull();
  });

  it("names the owner as well as the row", async () => {
    const { db, calls } = fakeWriteDb([record]);
    await updateRow(db, ME, ROW, { isFavorite: true });
    expect(calls).toContainEqual({ column: "id", value: ROW });
    expect(calls).toContainEqual({ column: "user_id", value: ME });
  });
});

describe("deleteRow", () => {
  it("says whether a row went", async () => {
    expect(await deleteRow(fakeWriteDb([{ id: ROW }]).db, ME, ROW)).toBe(true);
    expect(await deleteRow(fakeWriteDb([]).db, ME, ROW)).toBe(false);
  });

  it("names the owner as well as the row", async () => {
    const { db, calls } = fakeWriteDb([{ id: ROW }]);
    await deleteRow(db, ME, ROW);
    expect(calls).toContainEqual({ column: "id", value: ROW });
    expect(calls).toContainEqual({ column: "user_id", value: ME });
  });
});
