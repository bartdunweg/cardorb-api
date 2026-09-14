import { describe, expect, it } from "vitest";
import { type FullArtCard, fullArtOf, productSaysFullArt } from "./full-art";

const card = (
  number: string,
  name: string,
  rarity: string | null,
  category?: string,
  trainerType?: string,
): FullArtCard => ({ number, name, rarity, category, trainerType });

const numbers = (cards: FullArtCard[]) => [...fullArtOf(cards)].map((c) => c.number);

describe("fullArtOf", () => {
  it("takes the rarities that are only ever full art", () => {
    expect(
      numbers([
        card("001", "Bulbasaur", "Common"),
        card("166", "Bulbasaur", "Illustration rare"),
        card("199", "Charizard ex", "Special illustration rare"),
      ]),
    ).toEqual(["166", "199"]);
  });

  /* The whole reason the set is read rather than the rarity: in Sun & Moon the plain GX is the
     Ultra Rare and the full art is the Secret Rare, the opposite of Scarlet & Violet. */
  it("leaves the first printing of a name out and takes the later one", () => {
    expect(
      numbers([
        card("12", "Decidueye GX", "Ultra Rare"),
        card("150", "Decidueye GX", "Secret Rare"),
      ]),
    ).toEqual(["150"]);
  });

  it("takes the full art ex of a Scarlet & Violet set and leaves its double rare", () => {
    expect(
      numbers([
        card("003", "Venusaur ex", "Double rare"),
        card("182", "Venusaur ex", "Ultra Rare"),
        card("198", "Venusaur ex", "Special illustration rare"),
      ]),
    ).toEqual(["182", "198"]);
  });

  it("leaves a hyper rare out: gold has borders, not full art", () => {
    expect(
      numbers([card("005", "Nest Ball", "Uncommon"), card("205", "Nest Ball", "Hyper rare")]),
    ).toEqual([]);
  });

  // Sword & Shield prints Marnie twice at the back of the set, and Quick Ball once. All three
  // are Secret Rare; only the trainer's kind says which two are full arts.
  it("takes a Supporter reprint and leaves the gold Item beside it", () => {
    expect(
      numbers([
        card("169", "Marnie", "Uncommon", "Trainer", "Supporter"),
        card("102", "Quick Ball", "Uncommon", "Trainer", "Item"),
        card("208", "Marnie", "Secret Rare", "Trainer", "Supporter"),
        card("216", "Quick Ball", "Secret Rare", "Trainer", "Item"),
        card("213", "Air Balloon", "Secret Rare", "Trainer", "Tool"),
      ]),
    ).toEqual(["208"]);
  });

  it("takes a trainer reprint the catalogue did not name the kind of, rather than dropping it", () => {
    expect(
      numbers([card("169", "Marnie", "Uncommon"), card("208", "Marnie", "Secret Rare")]),
    ).toEqual(["208"]);
  });

  it("never takes an energy reprint", () => {
    expect(
      numbers([
        card("100", "Fire Energy", "Common", "Energy"),
        card("170", "Fire Energy", "Secret Rare", "Energy"),
      ]),
    ).toEqual([]);
  });

  it("reads a number with leading zeros and one with none as the same number", () => {
    expect(
      numbers([
        card("3", "Charizard ex", "Double rare"),
        card("183", "Charizard ex", "Ultra Rare"),
      ]),
    ).toEqual(["183"]);
  });

  /* The spelling rarity-names.ts gives Shining Fates' shiny V and VMAX, which this list did not
     carry until 2026-09-14. */
  it("takes a shiny V and a shiny VMAX in the one spelling", () => {
    expect(
      numbers([
        card("SV107", "Charizard VMAX", "Shiny Rare VMAX"),
        card("SV108", "Centiskorch V", "Shiny Rare V"),
      ]),
    ).toEqual(["SV107", "SV108"]);
  });

  it("takes a card whose TCGplayer product is named full art, however alone in its set", () => {
    expect(
      numbers([
        { ...card("51", "Jolteon VMAX", "Holo Rare VMAX"), productName: "Jolteon VMAX" },
        { ...card("177", "Jolteon V", "Ultra Rare"), productName: "Jolteon V (Full Art)" },
        {
          ...card("152", "Grass Energy", "Ultra Rare", "Energy"),
          productName: "Grass Energy (Texture Full Art)",
        },
      ]),
    ).toEqual(["177", "152"]);
  });

  it("is empty for a set that has none", () => {
    expect(numbers([card("1", "Pikachu", "Common"), card("2", "Raichu", "Rare")])).toEqual([]);
  });
});

describe("productSaysFullArt", () => {
  it("reads full art anywhere in the product's name, and nothing else", () => {
    expect(productSaysFullArt("Piers (Full Art)")).toBe(true);
    expect(productSaysFullArt("Latias (Full Art Promo)")).toBe(true);
    expect(productSaysFullArt("Cheren (148 Full Art)")).toBe(true);
    expect(productSaysFullArt("Jolteon V")).toBe(false);
    expect(productSaysFullArt("Artful Fighter")).toBe(false);
    expect(productSaysFullArt(null)).toBe(false);
  });
});
