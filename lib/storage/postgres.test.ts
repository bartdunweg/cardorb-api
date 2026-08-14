import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { listRows } from "./postgres";

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
function fakeDb() {
  const calls: { column: string; value: unknown }[] = [];
  const chain: Record<string, unknown> = {
    select: () => chain,
    order: () => chain,
    range: () => chain,
    eq: (column: string, value: unknown) => {
      calls.push({ column, value });
      return chain;
    },
    then: (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null, count: 0 }),
  };
  return { db: { from: () => chain } as unknown as SupabaseClient, calls };
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
