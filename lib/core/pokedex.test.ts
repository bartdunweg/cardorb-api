import { describe, expect, it } from "vitest";
import { caught, getPokedex, normalise, speciesOf } from "./pokedex";
import type { CardSet, OwnedCard } from "./cards";

const card = (over: Partial<OwnedCard> & { name: string }): OwnedCard => ({
  key: over.name,
  number: "1",
  type: null,
  gen: null,
  image: null,
  imageHigh: null,
  imageSize: null,
  speciesId: speciesOf(over.name),
  price: null,
  tcgId: null,
  variants: [],
  owned: true,
  ...over,
});

const set = (name: string, cards: OwnedCard[]): CardSet => ({
  name,
  logo: null,
  logoSize: null,
  releaseDate: null,
  total: null,
  cards,
});

describe("normalise", () => {
  it("keeps the two Nidoran apart", () => {
    expect(normalise("Nidoran♀")).toBe("nidoranf");
    expect(normalise("Nidoran♂")).toBe("nidoranm");
  });

  it("does not care how the punctuation was typed", () => {
    for (const written of ["Mr. Mime", "Mr Mime", "Mr.Mime"]) {
      expect(normalise(written)).toBe("mrmime");
    }
    expect(normalise("Farfetch’d")).toBe(normalise("Farfetch'd"));
  });
});

describe("speciesOf", () => {
  it("finds the Pokémon under whatever the card is called", () => {
    const cases: [string, string][] = [
      ["Charizard", "Charizard"],
      ["Charizard ex", "Charizard"],
      ["Mega Charizard X", "Charizard"],
      ["Dark Charizard", "Charizard"],
      ["Team Rocket's Charizard ex", "Charizard"],
      ["Alolan Vulpix", "Vulpix"],
      ["Hisuian Zoroark VSTAR", "Zoroark"],
      ["Radiant Greninja", "Greninja"],
      ["Rapid Strike Urshifu VMAX", "Urshifu"],
      ["Origin Forme Dialga V", "Dialga"],
      ["Pikachu VMAX", "Pikachu"],
      ["Ho-Oh V", "Ho-Oh"],
      ["Porygon-Z", "Porygon-Z"],
      ["Type: Null", "Type: Null"],
      ["Tapu Koko ex", "Tapu Koko"],
      ["Mime Jr.", "Mime Jr."],
    ];
    for (const [written, species] of cases) {
      const id = speciesOf(written);
      expect(id, written).not.toBeNull();
      expect(normalise(String(id && SPECIES_NAME(id))), written).toBe(normalise(species));
    }
  });

  it("takes the longest name, not the first one that fits inside", () => {
    // The whole reason for the longest-first order: every one of these holds a
    // shorter species name inside it.
    expect(SPECIES_NAME(speciesOf("Mewtwo ex")!)).toBe("Mewtwo");
    expect(SPECIES_NAME(speciesOf("Lairon")!)).toBe("Lairon");
    expect(SPECIES_NAME(speciesOf("Porygon2")!)).toBe("Porygon2");
    expect(SPECIES_NAME(speciesOf("Slowking")!)).toBe("Slowking");
  });

  it("has nothing to say about trainers and energy", () => {
    for (const name of [
      "Professor's Research",
      "Ultra Ball",
      "Basic Water Energy",
      "Boss's Orders",
    ])
      expect(speciesOf(name), name).toBeNull();
  });
});

describe("getPokedex", () => {
  it("files every card under its Pokémon and leaves the rest empty", () => {
    const dex = getPokedex([
      set("A", [
        card({ name: "Charizard ex", price: { low: 40, market: 40, avg30: 45, nm: null } }),
        card({ name: "Charizard", price: { low: 5, market: 5, avg30: 6, nm: null } }),
        card({ name: "Pikachu", owned: false }),
        card({ name: "Ultra Ball" }),
      ]),
    ]);

    expect(dex).toHaveLength(1025);
    const charizard = dex[5]!; // #6
    expect(charizard.name).toBe("Charizard");
    expect(charizard.cards.map((c) => c.name)).toEqual(["Charizard ex", "Charizard"]);
    expect(charizard.owned).toBe(2);

    const pikachu = dex[24]!; // #25
    expect(pikachu.cards).toHaveLength(1);
    // On the wishlist is not in the binder.
    expect(pikachu.owned).toBe(0);

    expect(dex[0]!.cards).toEqual([]); // Bulbasaur, none of
    expect(caught(dex)).toBe(1);
  });
});

/** The Dex name for a number, for the assertions above. */
function SPECIES_NAME(id: number) {
  return getPokedex([])[id - 1]!.name;
}
