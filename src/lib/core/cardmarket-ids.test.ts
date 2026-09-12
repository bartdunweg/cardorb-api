import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import IDS from "./cardmarket-ids.generated.json";

/**
 * Two cards may not quietly come to share one Cardmarket product.
 *
 * Cardmarket names a product after its attacks and never after its number, so the holo and
 * the unlimited printing of one Pokemon, or a promo and its full art reprint, carry the same
 * name inside one expansion. TCGdex links on that name, so it hands both cards the same
 * product and both read one price. Fossil Gengar 20/62 stood at €202.12 against a card that
 * sells at €29.05, and the whole of Jungle, Fossil and Team Rocket's plain half stood beside
 * it, until #344 relinked 236 cards by their position in the product run.
 *
 * What is left is 2,054 cards that still share, and most of them are cards this check cannot
 * settle on its own: their name at their own position differs, so the run says nothing about
 * them. They are written down per set in cardmarket-collision-baseline.json, and this test
 * says the number may fall and never rise. A set that has none today may never gain one.
 *
 * The other half of the rule, that a card's product must sit in its set's own Cardmarket
 * expansion, is not here: it needs their 13MB catalogue, which a test may not fetch. It
 * belongs to the script that writes this map. Venusaur EX XY28 read €116.93 off a Japanese
 * card for want of it (#341).
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const BASELINE: Record<string, number> = JSON.parse(
  readFileSync(
    join(HERE, "..", "..", "..", "scripts", "cardmarket-collision-baseline.json"),
    "utf8",
  ),
);

/** The set half of a tcgId: everything before the last hyphen, so "base2-17" is "base2". */
const setOf = (tcgId: string): string => tcgId.slice(0, tcgId.lastIndexOf("-")) || tcgId;

function collisionsPerSet(): Record<string, number> {
  const ids = IDS as Record<string, number | null>;
  const onProduct = new Map<number, number>();
  for (const product of Object.values(ids)) {
    if (product) onProduct.set(product, (onProduct.get(product) ?? 0) + 1);
  }
  const per: Record<string, number> = {};
  for (const [tcgId, product] of Object.entries(ids)) {
    if (product && (onProduct.get(product) ?? 0) > 1) {
      const set = setOf(tcgId);
      per[set] = (per[set] ?? 0) + 1;
    }
  }
  return per;
}

describe("the Cardmarket product map", () => {
  const per = collisionsPerSet();

  it("has a baseline that describes the map it guards", () => {
    expect(Object.keys(BASELINE).length).toBeGreaterThan(0);
    expect(Object.keys(per).length).toBeGreaterThan(0);
  });

  it("gives no set more cards on a shared product than its baseline", () => {
    const worse = Object.entries(per)
      .filter(([set, n]) => n > (BASELINE[set] ?? 0))
      .map(([set, n]) => `${set}: ${n} cards share a product, baseline ${BASELINE[set] ?? 0}`);
    expect(worse).toEqual([]);
  });

  it("keeps no baseline for a set that has none left", () => {
    const stale = Object.keys(BASELINE).filter((set) => !(set in per));
    expect(stale, "relinked away: drop these from the baseline").toEqual([]);
  });
});
