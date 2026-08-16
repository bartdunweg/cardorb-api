import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { listRows, listValueSnapshots } from "./postgres";

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
    then: (resolve: (v: unknown) => unknown) =>
      resolve({ data, error: null, count: data.length }),
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
