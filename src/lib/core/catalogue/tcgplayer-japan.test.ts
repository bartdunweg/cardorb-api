import { describe, expect, it } from "vitest";
import { cardName, factsOfCardType, groupForSet, matchCard } from "./tcgplayer-japan";

describe("groupForSet", () => {
  const groups = [
    { groupId: 23643, name: "S4a: Shiny Star V", abbreviation: "S4a" },
    { groupId: 1, name: "Base Expansion Pack", abbreviation: "" },
    { groupId: 2, name: "Expansion Pack", abbreviation: "" },
    { groupId: 3, name: "ADV Expansion Pack", abbreviation: "" },
    { groupId: 4, name: "L2: Revived Legends", abbreviation: "L2" },
    { groupId: 5, name: "L2 Deck", abbreviation: "L2" },
  ];

  it("finds a set by its code", () => {
    expect(groupForSet(groups, { id: "S4a", name: "Shiny Star V" })?.groupId).toBe(23643);
  });

  it("prefers the group titled with the code where two share it", () => {
    expect(groupForSet(groups, { id: "L2", name: "Revived Legends" })?.groupId).toBe(4);
  });

  it("finds a vintage set by its English title, whole", () => {
    expect(groupForSet(groups, { id: "E1", name: "Base Expansion Pack" })?.groupId).toBe(1);
    expect(groupForSet(groups, { id: "PMCG1", name: "Expansion Pack" })?.groupId).toBe(2);
  });

  it("folds accents and punctuation in a title", () => {
    expect(
      groupForSet([{ groupId: 9, name: "Gold, Silver, to a New World..." }], {
        id: "neo1",
        name: "Gold, Silver, to a New World…",
      })?.groupId,
    ).toBe(9);
  });

  it("is null where nothing names the set", () => {
    expect(groupForSet(groups, { id: "VS1", name: "Pokémon Card VS" })).toBeNull();
  });
});

describe("cardName", () => {
  it("drops the number and the printing TCGplayer adds", () => {
    expect(cardName("Charizard V - 003/190 (Mirror Holofoil)")).toBe("Charizard V");
    expect(cardName("Powerful C Energy - 190/190")).toBe("Powerful C Energy");
    expect(cardName("Pikachu")).toBe("Pikachu");
  });
});

describe("matchCard", () => {
  const card = (number: string | null, name: string, productId: number) => ({
    productId,
    number,
    name,
    rarity: null,
    cardType: null,
    hp: null,
    stage: null,
    image: `x/${productId}`,
  });

  it("matches by number, whatever the padding", () => {
    expect(matchCard([card("7", "Charmander", 1)], { number: "007", name: "?" })?.productId).toBe(
      1,
    );
  });

  it("matches an unnumbered shelf by English name, only where the name is one card", () => {
    const shelf = [card(null, "Pikachu", 1), card(null, "Energy", 2), card(null, "Energy", 3)];
    expect(matchCard(shelf, { number: "025", name: "Pikachu" })?.productId).toBe(1);
    expect(matchCard(shelf, { number: "099", name: "Energy" })).toBeNull();
  });
});

describe("factsOfCardType", () => {
  it("files an energy type as a Pokémon's type and a trainer by its kind", () => {
    expect(factsOfCardType("Fire")).toEqual({
      category: "Pokemon",
      trainerType: null,
      types: ["Fire"],
    });
    expect(factsOfCardType("Trainer - Supporter")).toEqual({
      category: "Trainer",
      trainerType: "Supporter",
      types: [],
    });
    expect(factsOfCardType("Special")).toEqual({
      category: "Energy",
      trainerType: null,
      types: [],
    });
  });
});
