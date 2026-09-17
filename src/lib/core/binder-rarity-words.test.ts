import { describe, expect, it } from "vitest";
import { rarityOfEntry, strayRarityEntries } from "./binder-rarity-words.mjs";

describe("rarityOfEntry", () => {
  it("reads a Pokédex's split entry as its rarity, and a plain one as itself", () => {
    expect(rarityOfEntry("Ultra Rare / v")).toBe("Ultra Rare");
    expect(rarityOfEntry("Galarian Gallery / other")).toBe("Galarian Gallery");
    expect(rarityOfEntry("Holo Rare ex")).toBe("Holo Rare ex");
    // Not one of the web's split ids: the whole entry is the word.
    expect(rarityOfEntry("Ultra Rare / gx")).toBe("Ultra Rare / gx");
  });
});

describe("strayRarityEntries", () => {
  const known = ["Holo Rare", "Ultra Rare", "Galarian Gallery", "Holo Rare ex"];

  it("passes the copy's words, a row's own word and split entries of either", () => {
    expect(
      strayRarityEntries(
        ["holo rare", "Ultra Rare / ex", "Galarian Gallery / v", "Holo Rare ex"],
        known,
      ),
    ).toEqual([]);
  });

  it("names a word a respelling left behind", () => {
    // Migration 20260914200000 moved "Rare Holo" to "Holo Rare".
    expect(strayRarityEntries(["Rare Holo", "Rare Holo / v", "Holo Rare"], known)).toEqual([
      "Rare Holo",
      "Rare Holo / v",
    ]);
  });
});
