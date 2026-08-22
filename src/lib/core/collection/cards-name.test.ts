/**
 * Whether a Notion row and a TCGdex card are the same card.
 *
 * Every misspelling below was in the collection on 7 August 2026, found by
 * listing the rows whose number resolved to a card in the right set and whose
 * name then failed the check. Each one cost that card its scan, its price, its
 * own page and its slot in the Pokédex.
 */
import { describe, expect, it } from "vitest";
import { sameCard } from "./cards";

describe("sameCard", () => {
  it("is the same name however it is written", () => {
    expect(sameCard("Pikachu", "pikachu")).toBe(true);
    expect(sameCard("Farfetch'd", "Farfetchd")).toBe(true);
    expect(sameCard("Flabébé", "Flabebe")).toBe(true);
  });

  it("ignores the card type Bart leaves off", () => {
    expect(sameCard("Venusaur ex", "Venusaur")).toBe(true);
    expect(sameCard("Charizard VMAX", "Charizard")).toBe(true);
  });

  it("survives a typo in the binder", () => {
    const typos: [string, string][] = [
      ["Tyrantirar", "Tyranitar"],
      ["Mimikiyu", "Mimikyu"],
      ["Sigilpyh", "Sigilyph"],
      ["Lyanroc", "Lycanroc"],
      ["Aegilash", "Aegislash"],
      ["Mabostiff", "Mabosstiff"],
      ["Alomola", "Alomomola"],
      ["Dousion", "Duosion"],
      ["Skeledrige", "Skeledirge"],
      ["Sandale", "Sandile"],
      ["Clawf", "Klawf"],
      ["Troh", "Throh"],
      ["Teal Mask Ogrepon", "Teal Mask Ogerpon"],
      ["Iron Juglius", "Iron Jugulis"],
    ];
    for (const [notion, tcgdex] of typos) {
      expect(sameCard(notion, tcgdex), `${notion} / ${tcgdex}`).toBe(true);
    }
  });

  it("still refuses two different Pokémon", () => {
    // The pair the strict check was written for, and the reason the tolerance
    // is two edits rather than three.
    expect(sameCard("Mew", "Mewtwo")).toBe(false);
    // Short names get one edit, not two, or every three-letter Pokémon would
    // match the rest of them.
    expect(sameCard("Muk", "Mew")).toBe(false);
    expect(sameCard("Abra", "Aron")).toBe(false);
    expect(sameCard("Pikachu", "Raichu")).toBe(false);
    expect(sameCard("Zubat", "Golbat")).toBe(false);
    expect(sameCard("Eevee", "Espeon")).toBe(false);
  });

  it("is not fooled by a name that is merely inside another", () => {
    // What "does one contain the other" would have accepted, which is why the
    // check has never been that.
    expect(sameCard("Chikorita", "Chikorita ex")).toBe(true);
    expect(sameCard("Bulbasaur", "Ivysaur")).toBe(false);
  });
});
