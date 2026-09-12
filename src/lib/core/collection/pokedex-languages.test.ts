import { describe, expect, it } from "vitest";
import { speciesOf } from "./pokedex";

/**
 * A card off the Japanese shelf is named in Japanese, and the species list this file matches
 * against is English, so every one of them landed in no Pokédex slot.
 * The slot is the whole point of the page, and an empty one reads as "you do not own this".
 */
describe("speciesOf, off an English shelf", () => {
  it("places a Japanese card", () => {
    expect(speciesOf("ピカチュウex", "ja")).toBe(25);
    expect(speciesOf("リザードンV", "ja")).toBe(6);
  });

  it("takes the longest name, the way the English rule does", () => {
    // ミュウ (Mew, 151) sits inside ミュウツー (Mewtwo, 150). Shortest-first would file
    // every Mewtwo card under Mew, which is the bug this rule exists to prevent.
    expect(speciesOf("ミュウツーex", "ja")).toBe(150);
    expect(speciesOf("ミュウex", "ja")).toBe(151);
  });

  it("folds a full-width suffix", () => {
    // Cards print ex full-width often enough that the same card is otherwise two strings.
    expect(speciesOf("ピカチュウｅｘ", "ja")).toBe(25);
  });

  it("still answers null for a trainer", () => {
    expect(speciesOf("ハイパーボール", "ja")).toBeNull();
  });

  it("leaves the English path alone", () => {
    expect(speciesOf("Mewtwo ex")).toBe(150);
    expect(speciesOf("Charizard ex", null)).toBe(6);
  });
});
