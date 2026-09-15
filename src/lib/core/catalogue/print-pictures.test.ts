import { describe, expect, it } from "vitest";
import {
  englishPrintProducts,
  finishOfPrintingLabel,
  japanesePrintProducts,
  printKey,
  tcgdexPrintScans,
  withPrintPictures,
  withProvenPrintings,
} from "./print-pictures";

const product = (productId: number, name: string, number: string | null, imageCount = 1) => ({
  productId,
  name,
  imageCount,
  extendedData: number
    ? [
        { name: "Number", value: number },
        { name: "Rarity", value: "Common" },
      ]
    : [{ name: "Rarity", value: "Common" }],
});

describe("finishOfPrintingLabel", () => {
  it("reads every mirror spelling as the reverse holo", () => {
    for (const label of ["Mirror Holofoil", "Mirror Holo", "Mirror Foil", "Reverse Holofoil"])
      expect(finishOfPrintingLabel(label)).toBe("reverse-holo");
  });

  it("reads the ball and symbol patterns as their own finish", () => {
    expect(finishOfPrintingLabel("Poke Ball Pattern")).toBe("poke-ball");
    expect(finishOfPrintingLabel("Master Ball Pattern")).toBe("master-ball");
    expect(finishOfPrintingLabel("Energy Symbol Pattern")).toBe("energy-symbol");
  });

  it("has no finish for the Terastal pattern", () => {
    expect(finishOfPrintingLabel("Terastal Pattern")).toBeNull();
  });
});

describe("japanesePrintProducts", () => {
  // Pokémon Card 151's Bulbasaur, as tcgcsv listed it on 2026-09-15.
  const bulbasaur = [
    product(566346, "Bulbasaur - 001/165", "001/165"),
    product(566553, "Bulbasaur - 001/165 (Poke Ball Pattern)", "001/165"),
    product(566706, "Bulbasaur - 001/165 (Master Ball Pattern)", "001/165"),
  ];

  it("files each printing under the card its plain product is", () => {
    expect(japanesePrintProducts(bulbasaur, new Map([[566346, "SV2a-001"]]))).toEqual([
      { cardId: "SV2a-001", print: "poke-ball", productId: 566553, pictured: true },
      { cardId: "SV2a-001", print: "master-ball", productId: 566706, pictured: true },
    ]);
  });

  it("leaves out a printing of a card no plain product links", () => {
    expect(japanesePrintProducts(bulbasaur, new Map())).toEqual([]);
  });

  it("keeps a printing TCGplayer holds no picture of, unpictured, as the proof it exists", () => {
    const products = [
      product(1, "Oddish - 001/190", "001/190"),
      product(2, "Oddish - 001/190 (Mirror Holofoil)", "001/190", 0),
    ];
    expect(japanesePrintProducts(products, new Map([[1, "S4a-001"]]))).toEqual([
      { cardId: "S4a-001", print: "reverse-holo", productId: 2, pictured: false },
    ]);
  });

  it("takes the product with a picture where a printing is listed twice", () => {
    const products = [
      product(1, "Oddish - 001/190", "001/190"),
      product(2, "Oddish - 001/190 (Mirror Holofoil)", "001/190", 0),
      product(3, "Oddish - 001/190 (Mirror Holo)", "001/190"),
    ];
    expect(japanesePrintProducts(products, new Map([[1, "S4a-001"]]))).toEqual([
      { cardId: "S4a-001", print: "reverse-holo", productId: 3, pictured: true },
    ]);
  });

  it("never files a printing under a same-named card with another number", () => {
    const products = [
      product(1, "Pikachu - 025/165", "025/165"),
      product(2, "Pikachu - 026/165", "026/165"),
      product(3, "Pikachu - 026/165 (Mirror Holofoil)", "026/165"),
    ];
    const cards = new Map([
      [1, "X-025"],
      [2, "X-026"],
    ]);
    expect(japanesePrintProducts(products, cards)).toEqual([
      { cardId: "X-026", print: "reverse-holo", productId: 3, pictured: true },
    ]);
  });
});

describe("englishPrintProducts", () => {
  it("names Prismatic Evolutions' Poké Ball and Master Ball reverses", () => {
    const exeggcute = englishPrintProducts().filter((p) => p.cardId === "sv08.5-001");
    expect(exeggcute.map((p) => p.print).sort()).toEqual(["master-ball", "poke-ball"]);
  });

  it("names each printing once, where TCGplayer lists two products of it", () => {
    const keys = englishPrintProducts().map((p) => `${p.cardId}|${p.print}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("keys a pattern holo with its pattern", () => {
    expect(englishPrintProducts().some((p) => p.print === printKey("holo", "cosmos"))).toBe(true);
  });
});

describe("withPrintPictures", () => {
  it("gives a printing its picture and every other one null", () => {
    const pictures = new Map([["poke-ball", "https://images.cardorb.com/tcgplayer/566553.jpg"]]);
    expect(
      withPrintPictures(
        [
          { finish: "normal", foilPattern: null },
          { finish: "poke-ball", foilPattern: null },
        ],
        pictures,
      ),
    ).toEqual([
      { finish: "normal", foilPattern: null, image: null },
      {
        finish: "poke-ball",
        foilPattern: null,
        image: "https://images.cardorb.com/tcgplayer/566553.jpg",
      },
    ]);
  });
});

describe("tcgdexPrintScans", () => {
  // Pokémon Card 151 as TCGdex and the copy list it: Bulbasaur has a Poké Ball reverse, Venusaur ex does not.
  const cards = [
    { id: "SV2a-001", image: "https://assets.tcgdex.net/ja/SV/SV2a/001" },
    { id: "SV2a-003", image: "https://assets.tcgdex.net/ja/SV/SV2a/003" },
    { id: "SV2a-004", image: null },
  ];
  const variants = new Map([
    [
      "SV2a-001",
      [
        { type: "normal" },
        { type: "reverse", foil: "pokeball" },
        { type: "reverse", foil: "masterball" },
      ],
    ],
    ["SV2a-003", [{ type: "holo" }]],
    ["SV2a-004", [{ type: "reverse", foil: "pokeball" }]],
  ]);

  it("takes the scan as the printing's picture for a card printed that way", () => {
    expect(tcgdexPrintScans(cards, "poke-ball", variants)).toEqual([
      {
        cardId: "SV2a-001",
        print: "poke-ball",
        folder: "https://assets.tcgdex.net/ja/SV/SV2a/001",
      },
    ]);
  });

  it("never files a plain scan under a printing the card was not printed in", () => {
    expect(
      tcgdexPrintScans(cards, "master-ball", new Map([["SV2a-003", [{ type: "holo" }]]])),
    ).toEqual([]);
  });
});

describe("withProvenPrintings", () => {
  it("adds a printing TCGplayer sells that TCGdex does not list, in FINISHES order", () => {
    const proven = new Map<string, string | null>([["reverse-holo", null]]);
    expect(
      withProvenPrintings(
        [
          { finish: "normal", foilPattern: null },
          { finish: "holo", foilPattern: null },
        ],
        proven,
      ),
    ).toEqual([
      { finish: "normal", foilPattern: null },
      { finish: "reverse-holo", foilPattern: null },
      { finish: "holo", foilPattern: null },
    ]);
  });

  it("adds nothing TCGdex already lists, and no pattern key", () => {
    const printings = [{ finish: "normal" as const, foilPattern: null }];
    expect(
      withProvenPrintings(
        printings,
        new Map([
          ["normal", "x"],
          ["holo/cosmos", "y"],
        ]),
      ),
    ).toBe(printings);
  });
});
