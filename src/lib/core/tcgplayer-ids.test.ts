import { describe, expect, it } from "vitest";
import TCGPLAYER_IDS from "./tcgplayer-ids.generated.json";

/**
 * One TCGplayer product for two English cards is almost always a wrong link: the card is priced,
 * and since #394 pictured, as another. On 2026-09-14 seventeen such links were found by laying
 * TCGdex's list beside TCGplayer's (Pokémon Rumble Starmie and Gyarados both on Ninetales, seven
 * Brilliant Stars Trainer Gallery cards on their main-set namesakes, Aquapolis a/b). What is left
 * here is the same printing listed twice: a trainer kit card in both halves' TCGdex sets, and the
 * Generations and XY alternate arts TCGdex files under Yellow A Alternate too. Trainer kit halves are
 * not: TCGplayer sells each half-deck's copy as a product of its own ("Hau (#19) (Lycanroc
 * Half-Deck)"), and six kit cards read the other half's until 2026-09-14.
 */
const SAME_PRINTING = new Set([
  "g1-28a xya-28a",
  "xy10-54a xya-54a",
  "xy3-55a xya-55a",
  "xy4-24a xya-24a",
  "xy6-92a xya-92a",
  "xy9-107a xya-107a",
]);

describe("tcgplayer-ids.generated.json", () => {
  it("links no TCGplayer product to two cards, unless it is one printing listed twice", () => {
    const byProduct = new Map<number, string[]>();
    for (const [id, link] of Object.entries(
      TCGPLAYER_IDS as Record<string, { productId: number } | null>,
    )) {
      if (link) byProduct.set(link.productId, [...(byProduct.get(link.productId) ?? []), id]);
    }
    const shared = [...byProduct.values()]
      .filter((ids) => ids.length > 1)
      .map((ids) => ids.sort().join(" "))
      .filter((pair) => !SAME_PRINTING.has(pair));
    expect(shared).toEqual([]);
  });
});
