import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  copyRow,
  createRow,
  createRows,
  deleteRow,
  listAccountIds,
  listRows,
  listValueSnapshots,
  updateRow,
} from "./postgres";
import type { CardDraft } from "@/lib/core/collection/collection-row";

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
      // A row written before the added columns existed reads as nothing added.
      {
        date: "2024-12-30",
        value: 15_634,
        cards: 1524,
        priced: 1211,
        unpriced: 313,
        added: 0,
        addedValue: 0,
      },
      {
        date: "2026-08-06",
        value: 39_887,
        cards: 1524,
        priced: 1211,
        unpriced: 313,
        added: 0,
        addedValue: 0,
      },
    ]);
  });

  // The migration adding the columns runs after the deploy that reads them (migrate.yml).
  it("reads without the added columns while the database does not have them yet", async () => {
    const selects: string[] = [];
    const chain: Record<string, unknown> = {
      select: (columns: string) => {
        selects.push(columns);
        return chain;
      },
      order: () => chain,
      range: () => chain,
      eq: () => chain,
      then: (resolve: (v: unknown) => unknown) =>
        resolve(
          selects.at(-1)!.includes("added_cards")
            ? {
                data: null,
                error: { message: "column collection_value_snapshots.added_cards does not exist" },
              }
            : { data: [snapshot()], error: null, count: 1 },
        ),
    };
    const db = { from: () => chain } as unknown as SupabaseClient;
    const out = await listValueSnapshots(db, "u");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ added: 0, addedValue: 0 });
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
  // A patch to what makes a kind folds afterwards; here nothing is the same kind, so the
  // fold hands the row back as written.
  const rpc = async () => ({ data: returned, error: null });
  return { db: { from: () => chain, rpc } as unknown as SupabaseClient, calls };
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
      dexFace: false,
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
  it("hands back the row that went, whole, and null when none did", async () => {
    // Whole rather than the id alone: after the delete there is nowhere else to
    // read it, and a client offering an undo has to be able to put it back.
    const row = await deleteRow(fakeWriteDb([record]).db, ME, ROW);
    expect(row).toMatchObject({
      id: ROW,
      name: "Pikachu",
      setName: "Base Set",
      acquiredAt: "2026-01-02T00:00:00.000Z",
      quantity: 2,
      purchasePrice: 4.5,
      isFavorite: true,
      dexFace: false,
    });
    expect(await deleteRow(fakeWriteDb([]).db, ME, ROW)).toBeNull();
  });

  it("names the owner as well as the row", async () => {
    const { db, calls } = fakeWriteDb([record]);
    await deleteRow(db, ME, ROW);
    expect(calls).toContainEqual({ column: "id", value: ROW });
    expect(calls).toContainEqual({ column: "user_id", value: ME });
  });
});

/** Just enough to catch the insert: createRow() ends `.select("id").single()`. */
function fakeInsertDb() {
  const written: Record<string, unknown>[] = [];
  const chain: Record<string, unknown> = {
    insert: (row: Record<string, unknown>) => {
      written.push(row);
      return chain;
    },
    select: () => chain,
    single: async () => ({ data: { id: ROW }, error: null }),
  };
  return { db: { from: () => chain } as unknown as SupabaseClient, written };
}

const draft = (over: Partial<CardDraft> = {}): CardDraft => ({
  name: "Pikachu",
  number: "25",
  set: "Base Set",
  rarity: "",
  gen: "",
  types: [],
  tcgId: null,
  collection: true,
  excluded: false,
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
  ...over,
});

describe("createRow", () => {
  it("leaves acquired_at out of the insert when the draft names no date", async () => {
    // Out, not null: the column default is now(), and a null written over it
    // would turn "you just pulled this" into a card with no date at all.
    const { db, written } = fakeInsertDb();
    await createRow(db, draft());
    expect(written[0]).not.toHaveProperty("acquired_at");
  });

  it("writes the date a restore carries, so a card put back keeps the day it was got", async () => {
    const { db, written } = fakeInsertDb();
    await createRow(db, draft({ acquiredAt: "2026-01-02T00:00:00.000Z" }));
    expect(written[0]).toMatchObject({ acquired_at: "2026-01-02T00:00:00.000Z" });
  });

  it("stores a promo as the number it wraps, like its siblings, and keeps a gallery's letters", async () => {
    const { db, written } = fakeInsertDb();
    await createRow(db, draft({ number: "XY123", set: "XY Black Star Promos" }));
    await createRow(db, draft({ number: " SWSH050 ", set: "SWSH Black Star Promos" }));
    await createRow(db, draft({ number: "TG01", set: "Silver Tempest" }));
    expect(written.map((w) => w.number)).toEqual(["123", "050", "TG01"]);
  });
});

describe("createRows", () => {
  it("stores an imported promo number without its prefix", async () => {
    const batches: Record<string, unknown>[][] = [];
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: async () => ({ count: 0, error: null }),
      upsert: async (batch: Record<string, unknown>[]) => {
        batches.push(batch);
        return { error: null };
      },
    };
    const db = {
      from: () => chain,
      rpc: async () => ({ data: 0, error: null }),
    } as unknown as SupabaseClient;
    const row = (number: string) => ({ ...draft(), number, setName: "XY Black Star Promos" });
    await createRows(db, ME, [row("XY67a"), row("122")] as never, "csv");
    expect(batches.flat().map((b) => b.number)).toEqual(["67A", "122"]);
  });
});

/**
 * PostgREST's thousand-row cap, made real.
 *
 * fakeDb above hands back the same list to every request, so a query that does
 * not page and one that does are indistinguishable to it — which is how these
 * two reads went years without anybody noticing they stop at a thousand rows.
 * This one answers *by range*, caps every page the way the server does, and
 * puts the true size only in `count`. A read that does not page comes back
 * short here, exactly as it does in production.
 *
 * `from()` builds a fresh chain per call because the pages after the first are
 * built together and awaited together: a shared builder would have the last
 * `range()` win for all of them.
 */
function pagedDb(rows: unknown[], cap = 1_000, { losePagesAfterTheFirst = false } = {}) {
  const ranges: [number, number][] = [];
  const from = () => {
    let start = 0;
    let end = cap - 1;
    let counted = false;
    const chain: Record<string, unknown> = {
      select: (_columns: string, opts?: { count?: string }) => {
        counted = opts?.count === "exact";
        return chain;
      },
      order: () => chain,
      eq: () => chain,
      range: (a: number, b: number) => {
        start = a;
        end = b;
        ranges.push([a, b]);
        return chain;
      },
      then: (resolve: (v: unknown) => unknown) =>
        resolve({
          // The cap is the server's, not the caller's: asking for more than a
          // thousand gets a thousand, silently.
          data:
            losePagesAfterTheFirst && start > 0
              ? []
              : rows.slice(start, Math.min(end + 1, start + cap)),
          error: null,
          count: counted ? rows.length : null,
        }),
    };
    return chain;
  };
  return { db: { from } as unknown as SupabaseClient, ranges };
}

describe("reading past PostgREST's thousand-row cap", () => {
  it("listValueSnapshots keeps the newest readings, which the cap drops first", async () => {
    // Ordered oldest first, so an unpaged read of 2,300 readings loses the last
    // 1,300 — the recent end. The chart freezes at a date and goes on drawing,
    // which is the failure this cannot announce on its own.
    const rows = Array.from({ length: 2_300 }, (_, i) =>
      snapshot({ snapshot_date: `d${String(i).padStart(4, "0")}`, value_cents: i * 100 }),
    );
    const { db } = pagedDb(rows);
    const out = await listValueSnapshots(db, "u");
    expect(out).toHaveLength(2_300);
    expect(out.at(-1)).toMatchObject({ date: "d2299", value: 2_299 });
  });

  it("listAccountIds visits every account, not the first thousand", async () => {
    // It feeds the nightly snapshot and the warm cron. Past a thousand accounts
    // the rest simply never get a reading, and nothing reports it.
    const rows = Array.from({ length: 1_400 }, (_, i) => ({ id: `acct-${i}` }));
    const { db } = pagedDb(rows);
    const ids = await listAccountIds(db);
    expect(ids).toHaveLength(1_400);
    expect(ids.at(-1)).toBe("acct-1399");
  });

  it("throws rather than hand back a short list, on either read", async () => {
    // listRows already does this: a collection missing a third of itself reads
    // as somebody having sold some cards. A frozen chart and a skipped account
    // are the same kind of quiet, so they get the same loud.
    // Pages after the first come back empty while `count` still says 2,300:
    // the shape a store takes when it stops answering halfway through.
    const short = (rows: unknown[]) => pagedDb(rows, 1_000, { losePagesAfterTheFirst: true }).db;
    const readings = Array.from({ length: 2_300 }, (_, i) =>
      snapshot({ snapshot_date: `d${String(i).padStart(4, "0")}` }),
    );
    await expect(listValueSnapshots(short(readings), "u")).rejects.toThrow(/truncated/);
    await expect(
      listAccountIds(short(Array.from({ length: 2_300 }, (_, i) => ({ id: `a${i}` })))),
    ).rejects.toThrow(/truncated/);
  });
});

/**
 * A write that can make two rows the same kind folds the row it wrote: the
 * store keeps one row per kind, and `fold_card` in the database is what keeps
 * it so. The fake answers the write from `returned` and the fold from `folded`,
 * and notes which functions were called.
 */
function fakeFoldDb(returned: unknown[], folded: unknown[]) {
  const rpcs: { fn: string; args: Record<string, unknown> }[] = [];
  const chain: Record<string, unknown> = {
    update: () => chain,
    insert: () => chain,
    upsert: async () => ({ error: null }),
    eq: () => chain,
    select: () => chain,
    single: async () => ({ data: returned[0] ?? null, error: null }),
    maybeSingle: async () => ({ data: returned[0] ?? null, error: null }),
    then: (resolve: (v: unknown) => unknown) =>
      resolve({ data: returned, error: null, count: returned.length }),
  };
  const db = {
    from: () => chain,
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcs.push({ fn, args });
      return { data: folded, error: null };
    },
  } as unknown as SupabaseClient;
  return { db, rpcs };
}

describe("one row per kind", () => {
  const OTHER = "33333333-3333-3333-3333-333333333333";

  it("folds after a patch to what makes a kind, and answers with the folded row", async () => {
    const { db, rpcs } = fakeFoldDb([record], [{ ...record, quantity: 5 }]);
    const row = await updateRow(db, ME, ROW, { condition: "Near Mint" });
    expect(rpcs).toEqual([{ fn: "fold_card", args: { p_id: ROW, p_user_id: ME } }]);
    expect(row?.quantity).toBe(5);
  });

  it("does not fold after a note or a price: those make no other kind", async () => {
    const { db, rpcs } = fakeFoldDb([record], []);
    const row = await updateRow(db, ME, ROW, { notes: "PSA next week", purchasePrice: 3 });
    expect(rpcs).toEqual([]);
    expect(row?.quantity).toBe(2);
  });

  it("folds a copy into the row already held of that kind", async () => {
    const { db, rpcs } = fakeFoldDb([{ ...record, id: OTHER }], [{ ...record, quantity: 3 }]);
    const row = await copyRow(db, ME, ROW, 1, {});
    expect(rpcs).toEqual([{ fn: "fold_card", args: { p_id: OTHER, p_user_id: ME } }]);
    expect(row).toMatchObject({ id: ROW, quantity: 3 });
  });

  it("folds an import into what is held", async () => {
    const { db, rpcs } = fakeFoldDb([], []);
    await createRows(db, ME, [], "csv");
    expect(rpcs).toEqual([{ fn: "fold_identical_cards", args: { p_user_id: ME } }]);
  });
});
