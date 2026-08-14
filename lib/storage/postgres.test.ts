import { describe, expect, it } from "vitest";
import { listRows } from "./postgres";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The paging, and only the paging.
 *
 * This file exists because of one bug, and the bug is worth stating so nobody
 * reintroduces it while tidying. listRows() used to ask for two thousand rows a
 * page and stop when a page came back shorter than it asked for. PostgREST caps
 * a response at a thousand, so the very first page was "shorter than asked for"
 * and the loop exited with half the collection. A 1,968 card binder rendered as
 * 836 cards over 41 of its 52 sets, and nothing raised an error anywhere: it
 * simply looked like a smaller collection, which is the worst way for data to
 * go missing.
 *
 * So the fake below does exactly what the real server does — hands back at most
 * CAP rows however many were requested — and the tests are about what the loop
 * concludes from that.
 */

const CAP = 1_000;

type Row = {
  id: string;
  name: string;
  number: string;
  set_name: string;
  rarity: string | null;
  gen: string | null;
  types: string[] | null;
  owned: boolean;
  excluded: boolean;
  acquired_at: string;
};

const row = (i: number): Row => ({
  id: `id-${String(i).padStart(5, "0")}`,
  name: `Card ${i}`,
  number: String(i),
  set_name: "Base",
  rarity: null,
  gen: null,
  types: null,
  owned: true,
  excluded: false,
  // Deliberately the same timestamp for every row: that is what a pack opened
  // in one sitting looks like, and it is why the query needs a unique tiebreak
  // to page over at all.
  acquired_at: "2026-07-25T10:00:00.000Z",
});

/**
 * A stand-in for PostgREST that refuses to hand over more than CAP rows at a
 * time, counts how it was asked, and remembers the sort it was given.
 *
 * Thenable rather than returning a promise from range(), because that is what
 * supabase-js is: every method hands back the same builder and the query only
 * runs when something awaits it. Getting this wrong in the fake hides a real
 * mistake — the filters this code applies after range() would appear to work
 * here and throw in production.
 */
function builder(run: (state: State) => { data: Row[] | null; error: { message: string } | null; count: number | null }) {
  const state: State = { count: false, range: null, filters: [], orders: [] };
  const q: Record<string, unknown> = {
    select: (_cols: string, o?: { count?: string }) => {
      state.count = o?.count === "exact";
      return q;
    },
    order: (col: string) => {
      state.orders.push(col);
      return q;
    },
    eq: (col: string, val: string) => {
      state.filters.push([col, val]);
      return q;
    },
    range: (from: number, to: number) => {
      state.range = { from, to };
      return q;
    },
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(run(state)).then(resolve),
  };
  return { q, state };
}

type State = {
  count: boolean;
  range: { from: number; to: number } | null;
  filters: [string, string][];
  orders: string[];
};

function fakeDb(total: number, opts: { cap?: number } = {}) {
  const cap = opts.cap ?? CAP;
  const all = Array.from({ length: total }, (_, i) => row(i));
  const calls: { from: number; to: number }[] = [];
  const orders: string[] = [];
  const filters: [string, string][] = [];

  const db = {
    from: () => {
      const { q } = builder((state) => {
        const { from, to } = state.range!;
        calls.push({ from, to });
        orders.push(...state.orders);
        filters.push(...state.filters);
        const asked = to - from + 1;
        return {
          data: all.slice(from, from + Math.min(asked, cap)),
          error: null,
          count: state.count ? total : null,
        };
      });
      return q;
    },
  };

  return { db: db as unknown as SupabaseClient, calls, orders, filters };
}

describe("listRows paging", () => {
  it("reads a collection larger than one page", async () => {
    // The regression. 1,968 is the real number this went wrong on.
    const { db } = fakeDb(1_968);
    const rows = await listRows(db);
    expect(rows).toHaveLength(1_968);
  });

  it("does not stop when a page comes back capped", async () => {
    // The exact shape of the old bug: asking for more than the server will give
    // and reading the short answer as "that was the last of them".
    const { db, calls } = fakeDb(1_968);
    await listRows(db);
    expect(calls.length).toBeGreaterThan(1);
    // Nothing may ask for more than the cap, or the first answer is a lie about
    // how many there are.
    for (const c of calls) expect(c.to - c.from + 1).toBeLessThanOrEqual(CAP);
  });

  it("orders by something unique, so pages cannot overlap", async () => {
    // Every row in the fake shares an acquired_at. Without a unique tiebreak
    // the database may legally return a row on two pages and another on none,
    // and the collection would be both short and doubled.
    const { db, orders } = fakeDb(1_968);
    await listRows(db);
    expect(orders).toContain("id");
  });

  it("reads a collection that fits in one page without asking twice", async () => {
    const { db, calls } = fakeDb(12);
    expect(await listRows(db)).toHaveLength(12);
    expect(calls).toHaveLength(1);
  });

  it("handles an empty collection", async () => {
    const { db } = fakeDb(0);
    expect(await listRows(db)).toEqual([]);
  });

  it("reads a collection that is exactly one page", async () => {
    // The off-by-one worth pinning: at exactly the cap, "I got a full page"
    // and "there is more" are the same observation.
    const { db } = fakeDb(CAP);
    expect(await listRows(db)).toHaveLength(CAP);
  });

  it("shouts rather than returning a short collection", async () => {
    // If the count and the rows ever disagree, the honest answer is an error.
    // A binder missing a third of itself renders as a smaller binder, which is
    // indistinguishable from having sold some cards.
    const { db } = fakeDb(1_968, { cap: 0 });
    await expect(listRows(db)).rejects.toThrow(/truncated/i);
  });

  it("passes the store's own error up rather than returning what it has", async () => {
    const db = {
      from: () => builder(() => ({ data: null, error: { message: "nope" }, count: null })).q,
    } as unknown as SupabaseClient;
    await expect(listRows(db)).rejects.toThrow(/nope/);
  });

  it("narrows to one person when asked, for the public page", async () => {
    // The filter is applied after range(), which only works because the query
    // builder is chainable all the way to the await. This is the test that
    // catches it if that ever stops being true.
    const { db, filters } = fakeDb(3);
    await listRows(db, "user-1");
    expect(filters).toContainEqual(["user_id", "user-1"]);
  });

  it("asks for nobody in particular when not told to", async () => {
    // The signed-in path leans entirely on row level security; a WHERE clause
    // here would be a second, weaker copy of that rule.
    const { db, filters } = fakeDb(3);
    await listRows(db);
    expect(filters).toEqual([]);
  });
});
