import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type TcgplayerJapanCard,
  cardName,
  factsOfCardType,
  groupCards,
  groupForSet,
  matchCard,
  matchCards,
  namesAgree,
  productIsAnother,
  sharedCodeGroups,
} from "./tcgplayer-japan";

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

describe("groupForSet, by hand and where codes are shared", () => {
  const groups = [
    { groupId: 23692, name: "SM1+: Sun & Moon", abbreviation: "SM1+" },
    { groupId: 23880, name: "sm1+: Enhanced Expansion Pack Sun & Moon", abbreviation: "sm1+" },
    { groupId: 23721, name: "Expansion Pack", abbreviation: "" },
    { groupId: 24129, name: "ADV Expansion Pack", abbreviation: "" },
    { groupId: 24124, name: "Magma VS Aqua: Two Ambitions", abbreviation: "" },
    { groupId: 23916, name: "XY11-Bb: Fever-Burst Fighter", abbreviation: "XY11-Bb" },
  ];

  // 2026-09-14: TCGdex's ADV1 is "Expansion Pack", the 1996 PMCG group's title.
  it("takes the group the table names over code and title", () => {
    expect(groupForSet(groups, { id: "ADV1", name: "Expansion Pack" })?.groupId).toBe(24129);
    expect(groupForSet(groups, { id: "XY11a", name: "Explosive Fighter" })?.groupId).toBe(23916);
    expect(groupForSet(groups, { id: "SM1p", name: "Sun & Moon" })?.groupId).toBe(23880);
  });

  it("matches a title whole as well as after its code", () => {
    expect(
      groupForSet(groups, { id: "ADV4x", name: "Magma VS Aqua: Two Ambitions" })?.groupId,
    ).toBe(24124);
  });

  it("takes the group with the most numbered cards where several share the code", () => {
    const numbered = new Map([
      [23692, 1],
      [23880, 68],
    ]);
    expect(groupForSet(groups, { id: "SM1+", name: "Sun & Moon" }, numbered)?.groupId).toBe(23880);
    expect(sharedCodeGroups(groups, [{ id: "SM1+" }, { id: "SM1p" }, { id: "S4a" }])).toEqual([
      23692, 23880,
    ]);
  });

  it("falls back on the title where the counts do not tell", () => {
    expect(groupForSet(groups, { id: "SM1+", name: "Sun & Moon" })?.groupId).toBe(23692);
  });
});

describe("cardName and labels", () => {
  it("drops a number written after the label", () => {
    expect(cardName("Larry's Efficiency (Mirror Foil) - 162/187")).toBe("Larry's Efficiency");
    expect(cardName("Pikachu & Zekrom GX (CoroCoro Edition) (Jumbo)")).toBe("Pikachu & Zekrom GX");
  });
});

describe("groupCards", () => {
  afterEach(() => vi.unstubAllGlobals());
  const product = (productId: number, name: string, number: string | null) => ({
    productId,
    name,
    extendedData: [
      ...(number ? [{ name: "Number", value: number }] : []),
      { name: "Rarity", value: "Common" },
      { name: "CardType", value: "Fire" },
    ],
  });
  const shelf = (products: unknown[]) =>
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ results: products })));

  it("reads a foil or a ball pattern as a printing of the plain card", async () => {
    shelf([
      product(1, "Oddish - 001/190", "001/190"),
      product(2, "Oddish - 001/190 (Mirror Holofoil)", "001/190"),
      product(3, "Oddish (Poke Ball Pattern)", "001/190"),
    ]);
    expect((await groupCards(1)).map((c) => c.productId)).toEqual([1]);
  });

  // neo2's Houndour (HR) and Houndour (U) are two cards; the copy held one until 2026-09-14.
  it("reads any other label as a card of its own", async () => {
    shelf([
      product(575420, "Houndour (HR)", null),
      product(575437, "Houndour (U)", null),
      product(9, "Gastrodon (West Sea)", null),
    ]);
    const cards = await groupCards(1);
    expect(cards.map((c) => [c.productId, c.label])).toEqual([
      [575420, "HR"],
      [575437, "U"],
      [9, "West Sea"],
    ]);
  });

  it("keeps two cards one number shares, by total and by name", async () => {
    shelf([
      product(669728, "Exeggcute - 009/742", "009/742"),
      product(678535, "Boltund - 009/023", "009/023"),
      product(573687, "Dust Island", "089/095"),
      product(573688, "Martial Arts Dojo", "089/095"),
    ]);
    expect((await groupCards(1)).map((c) => [c.productId, c.total])).toEqual([
      [669728, "742"],
      [678535, "023"],
      [573687, "095"],
      [573688, "095"],
    ]);
  });
});

describe("matchCard, name and number together", () => {
  const product = (
    productId: number,
    number: string | null,
    name: string,
    extra: Partial<TcgplayerJapanCard> = {},
  ): TcgplayerJapanCard => ({
    productId,
    number,
    name,
    rarity: null,
    cardType: null,
    hp: null,
    stage: null,
    image: `x/${productId}`,
    ...extra,
  });

  // SM10: TCGplayer numbers Kingler 026/095 beside Krabby 026/095.
  it("takes the product at the number whose name agrees", () => {
    const shelf = [product(573624, "026", "Kingler"), product(573625, "026", "Krabby")];
    expect(matchCard(shelf, { number: "026", name: "Krabby" })?.productId).toBe(573625);
  });

  it("refuses a lone product at the number that is another Pokémon", () => {
    expect(
      matchCard([product(1, "009", "Boltund")], { number: "009", name: "Exeggcute" }),
    ).toBeNull();
  });

  it("tells two numberings in one group apart by the set's printed total", () => {
    const shelf = [
      product(669728, "009", "Exeggcute", { total: "742" }),
      product(669000, "009", "Exeggcute", { total: "023" }),
    ];
    expect(
      matchCard(shelf, { number: "009", name: "Exeggcute", printedTotal: 742 })?.productId,
    ).toBe(669728);
  });

  it("prefers the plain product and the exact name among several that agree", () => {
    const shelf = [
      product(1, "097", "Venusaur"),
      product(2, "097", "Venusaur", { label: "No Rarity Symbol" }),
      product(3, "073", "Legendary Summit"),
      product(4, "073", "Legendary Summit [Set of 2]"),
    ];
    expect(matchCard(shelf, { number: "097", name: "Venusaur" })?.productId).toBe(1);
    expect(matchCard(shelf, { number: "073", name: "Legendary Summit" })?.productId).toBe(3);
  });

  it("finds an unnumbered card by name under the label it prints", () => {
    const shelf = [
      product(575420, null, "Houndour", { label: "HR" }),
      product(575437, null, "Houndour", { label: "U" }),
    ];
    expect(
      matchCard(shelf, { number: "039", name: "Houndour", localName: "houndour（u）" })?.productId,
    ).toBe(575437);
    expect(
      matchCard(shelf, { number: "012", name: "Houndour", localName: "ハウンドア（HR）" })
        ?.productId,
    ).toBe(575420);
  });

  it("keeps a trainer's link across two translations, unless its name sits elsewhere", () => {
    expect(
      matchCard([product(655853, "074", "Heat Burner")], { number: "074", name: "Blowtorch" })
        ?.productId,
    ).toBe(655853);
    // S8 before its record was put right: TCGdex's 126 said Training Court, TCGplayer's 127 does.
    const s8 = [product(569627, "126", "Power Tablet"), product(569628, "127", "Training Court")];
    expect(matchCard(s8, { number: "126", name: "Training Court" })).toBeNull();
    expect(productIsAnother(s8, "Training Court", s8[0]!)).toBe(true);
  });
});

describe("namesAgree", () => {
  it("agrees on an official and a literal name of one card", () => {
    expect(namesAgree("Erika's Oddish", "Oddish")).toBe(true);
    expect(namesAgree("N's Plan", "N's Plot")).toBe(true);
    expect(namesAgree("Boss's Orders", "Boss's Orders (Giovanni)")).toBe(true);
    expect(namesAgree("オーガポン", "Ogerpon")).toBe(true);
  });

  it("disagrees on two species and on two energies", () => {
    expect(namesAgree("Krabby", "Kingler")).toBe(false);
    expect(namesAgree("Basic Water Energy", "Basic Lightning Energy")).toBe(false);
  });
});

describe("matchCards", () => {
  const product = (productId: number, number: string, name: string): TcgplayerJapanCard => ({
    productId,
    number,
    name,
    rarity: null,
    cardType: null,
    hp: null,
    stage: null,
    image: "x",
  });

  it("gives a product to one card only, the one named as it is", () => {
    const shelf = [product(1, "WAT", "Basic Water Energy")];
    const found = matchCards(shelf, [
      { id: "MC-WAT", number: "WAT", name: "Basic Water Energy" },
      { id: "MC-WAT2", number: "WAT", name: "基本水エネルギー" },
    ]);
    expect(found.get("MC-WAT")?.productId).toBe(1);
    expect(found.get("MC-WAT2")).toBeNull();
  });

  it("gives it to neither where both are named alike", () => {
    const shelf = [product(575605, "067", "Clefairy")];
    const found = matchCards(shelf, [
      { id: "a", number: "067", name: "Clefairy" },
      { id: "b", number: "067", name: "Clefairy" },
    ]);
    expect([found.get("a"), found.get("b")]).toEqual([null, null]);
  });
});

describe("factsOfCardType, the rest", () => {
  it("files a bare Trainer as a trainer of no kind", () => {
    expect(factsOfCardType("Trainer")).toEqual({
      category: "Trainer",
      trainerType: null,
      types: [],
    });
  });

  // ADV5-060 Dodrio: 80 HP and no card type on TCGplayer.
  it("files a card with HP and no type as a Pokémon, and a fossil item as an item", () => {
    expect(factsOfCardType(null, 80)).toEqual({
      category: "Pokemon",
      trainerType: null,
      types: [],
    });
    expect(factsOfCardType("Trainer - Item", 60).category).toBe("Trainer");
    expect(factsOfCardType("Dragon;Dragon", 130).types).toEqual(["Dragon"]);
  });
});
