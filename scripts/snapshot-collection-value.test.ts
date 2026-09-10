import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isReverseFinish as fromPriceBasis } from "../src/lib/core/price-basis.mjs";
import { isReverseFinish as fromCollectionRow } from "../src/lib/core/collection/collection-row";

/**
 * The script that values a binder and the app that values the same binder, on the two
 * things they were free to disagree about.
 *
 * Read as source rather than imported, and not for want of trying: the script is a
 * top-level-await module that opens a service-role Supabase client and reads the live
 * collection the moment it is imported. There is nothing to unit-test without running it,
 * and running it is exactly what must not happen from a test. So the two rules below are
 * asserted where they are written.
 */

const SOURCE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "snapshot-collection-value.mjs"),
  "utf8",
);

describe("which price series a copy reads", () => {
  it("is one function, not two that agree today", () => {
    // Not toEqual: the point is that collection-row re-exports this rather than owning a
    // second copy of the rule, which is how the script's copy came to say something else.
    expect(fromCollectionRow).toBe(fromPriceBasis);
  });

  it("covers the ball printings, which are a reverse holo with a pattern on it", () => {
    expect(["reverse-holo", "poke-ball", "master-ball"].map(fromPriceBasis)).toEqual([
      true,
      true,
      true,
    ]);
    // Never the plain holo: on a holo-only card the -holo fields are a thinner market.
    expect(["holo", "normal", null].map((f) => fromPriceBasis(f))).toEqual([false, false, false]);
  });

  it("is the rule the script uses, rather than one it restates", () => {
    expect(SOURCE).toMatch(/isReverseFinish\b/);
    // The line it had. It priced a Poké Ball copy off the plain series while every other
    // valuation path priced it off the foil one, which runs at a median of twice as much.
    expect(SOURCE).not.toMatch(/finish\s*===\s*"reverse-holo"/);
  });
});

describe("what the script writes", () => {
  /**
   * Nothing, to that table. It upserted on (user_id, snapshot_date), the same row
   * /api/v1/cron/snapshot writes nightly, with a figure taken a different way: Cardmarket's
   * guide alone against the cron's blend of two markets. On a €100 card, 127.50 against
   * 113.75. The script's own header carries the whole argument.
   */
  it("does not write to collection_value_snapshots", () => {
    expect(SOURCE).not.toMatch(/from\(\s*"collection_value_snapshots"\s*\)/);
    expect(SOURCE).not.toMatch(/\.upsert\(/);
  });

  it("still reads the rows it values, so this is a write that stopped and not a script that did", () => {
    expect(SOURCE).toMatch(/from\(\s*"cards"\s*\)/);
    expect(SOURCE).toMatch(/valueAt\(/);
  });
});
