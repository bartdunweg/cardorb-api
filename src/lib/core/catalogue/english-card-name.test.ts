import { describe, expect, it } from "vitest";
import {
  printedStyleName,
  nameConventions,
  englishFromLocalName,
  englishFromRecord,
  keepsStoredName,
  printedNameOf,
  printedSuffix,
} from "./english-card-name.mjs";

/** A small Pokédex and its Japanese column, at the real Dex numbers. */
const species: string[] = [];
const local: { ja: string }[] = [];
const add = (dex: number, en: string, ja: string) => {
  species[dex - 1] = en;
  local[dex - 1] = { ja };
};
add(1, "Bulbasaur", "フシギダネ");
add(3, "Venusaur", "フシギバナ");
add(5, "Charmeleon", "リザード");
add(6, "Charizard", "リザードン");
add(29, "Nidoran♀", "ニドラン♀");
add(35, "Clefairy", "ピッピ");
add(36, "Clefable", "ピクシー");
add(43, "Oddish", "ナゾノクサ");
add(68, "Machamp", "カイリキー");
add(98, "Krabby", "クラブ");
add(107, "Hitmonchan", "エビワラー");
add(122, "Mr. Mime", "バリヤード");
add(127, "Pinsir", "カイロス");
add(150, "Mewtwo", "ミュウツー");
add(151, "Mew", "ミュウ");
add(193, "Yanma", "ヤンマ");
add(201, "Unown", "アンノーン");
add(209, "Snubbull", "ブルー");
add(251, "Celebi", "セレビィ");
add(448, "Lucario", "ルカリオ");
add(469, "Yanmega", "メガヤンマ");
add(658, "Greninja", "ゲッコウガ");
add(684, "Swirlix", "ペロッパフ");
add(685, "Slurpuff", "ペロリーム");
add(760, "Stufful", "ヌイコグマ");
add(809, "Melmetal", "メルメタル");
add(881, "Arctozolt", "パッチルドン");
add(883, "Arctovish", "ウオチルドン");
add(1017, "Ogerpon", "オーガポン");

const record = (name: string, dexId: number[] | null, extra: Record<string, unknown> = {}) => ({
  name,
  dexId,
  category: "Pokemon",
  ...extra,
});
const fromRecord = (name: string, dexId: number[] | null, extra: Record<string, unknown> = {}) =>
  englishFromRecord(record(name, dexId, extra), species, local);
const fromName = (name: string, category = "Pokemon") =>
  englishFromLocalName("ja", name, local, species, category);

describe("printedSuffix", () => {
  it("is the mechanic printed after the species, in English", () => {
    expect(printedSuffix("マスカーニャex")).toBe("ex");
    expect(printedSuffix("セレビィ&フシギバナGX")).toBe("GX");
    expect(printedSuffix("ピカチュウVMAX")).toBe("VMAX");
    expect(printedSuffix("メガリザードンXex")).toBe("X ex");
    expect(printedSuffix("メタグロス（デルタ種）")).toBe("δ");
    expect(printedSuffix("ナゾノクサ")).toBe("");
  });

  // 2026-09-14: TCGdex's vintage names are English, and their Latin tail was read as a suffix.
  it("is nothing where the Latin tail is a word of its own", () => {
    expect(printedSuffix("Clefable")).toBe("");
    expect(printedSuffix("nidoranf")).toBe("");
    expect(printedSuffix("Farfetch'd")).toBe("");
    expect(printedSuffix("v")).toBe("");
  });

  it("reads TCGdex's Ex as the ex the card prints", () => {
    expect(printedSuffix("Politoed Ex")).toBe("ex");
    expect(printedSuffix("Latios Ex（デルタ種）")).toBe("ex δ");
  });
});

describe("englishFromRecord", () => {
  it("names a Pokémon by its Dex number, with the mechanic as printed", () => {
    expect(fromRecord("ナゾノクサ", [43])).toBe("Oddish");
    expect(fromRecord("フシギバナex", [3])).toBe("Venusaur ex");
  });

  it("names a tag team in full", () => {
    expect(fromRecord("セレビィ&フシギバナGX", [251, 3])).toBe("Celebi & Venusaur GX");
    expect(fromRecord("ルカリオ&メルメタルGX", [448, 809])).toBe("Lucario & Melmetal GX");
  });

  it("names a card of an English or machine-translated record once", () => {
    expect(fromRecord("Clefable", [36])).toBe("Clefable");
    expect(fromRecord("Mime Ex", [122])).toBe("Mr. Mime ex");
    expect(fromRecord("nidoranf", [29])).toBe("Nidoran♀");
    expect(fromRecord("Rocket's Hitmonchan ex", [107])).toBe("Rocket's Hitmonchan ex");
  });

  it("keeps the owner the card prints before its Pokémon", () => {
    expect(fromRecord("エリカのナゾノクサ", [43])).toBe("Erika's Oddish");
    expect(fromRecord("ヒビキのカイロス", [127])).toBe("Ethan's Pinsir");
    // VS1: Bruno's ブルーノ holds Snubbull's ブルー.
    expect(fromRecord("ブルーノのカイリキー", [68])).toBe("Bruno's Machamp");
    // VS1: TCGdex's katakana for Falkner, and the species left in English.
    expect(fromRecord("フォークナーのpinsir", [127])).toBe("Falkner's Pinsir");
    expect(fromRecord("MortyのPinsir", [127])).toBe("Morty's Pinsir");
  });

  it("keeps a kind and a form the card prints", () => {
    expect(fromRecord("かがやくゲッコウガ", [658])).toBe("Radiant Greninja");
    expect(fromRecord("わるいリザードン", [6])).toBe("Dark Charizard");
    expect(fromRecord("暗いカリザード", [6])).toBe("Dark Charizard");
    expect(fromRecord("輝くチャリザード", [6])).toBe("Shining Charizard");
    expect(fromRecord("オーガポン みどりのめんex", [1017])).toBe("Teal Mask Ogerpon ex");
  });

  it("reads a spelled-out Star only on a card rated a star", () => {
    expect(fromRecord("カリザードスター（デルタ種）", [6], { rarity: "Shiny rare" })).toBe(
      "Charizard Star δ",
    );
    // PCG1's machine translation of Scyther, スキスター, ends in スター too; it is a Rare.
    expect(fromRecord("スキスター", [127], { rarity: "Rare" })).toBe("Pinsir");
  });

  it("gives neo's Unown its letter", () => {
    expect(fromRecord("v", [201])).toBe("Unown V");
    expect(fromRecord("未定のt", [201])).toBe("Unown T");
  });

  it("takes the species a name is exactly over a wrong Dex number", () => {
    expect(fromRecord("ウオチルドンV", [881])).toBe("Arctovish V");
    expect(fromRecord("ペロッパフ", [684])).toBe("Swirlix");
    // A machine translation only holding a species' name (リザード) is not that species.
    expect(fromRecord("カリザード", [6])).toBe("Charizard");
  });

  it("is null for a trainer, an energy, or a species the table does not have", () => {
    expect(fromRecord("ピッピ人形", [35], { category: "Trainer" })).toBeNull();
    expect(fromRecord("ルミナスエネルギー", null)).toBeNull();
    expect(fromRecord("?", [9999])).toBeNull();
    expect(englishFromRecord(null, species, local)).toBeNull();
  });
});

describe("englishFromLocalName", () => {
  it("names a Pokémon by the species written inside its printed name, mechanic kept", () => {
    expect(fromName("ヌイコグマ")).toBe("Stufful");
    expect(fromName("フシギバナex")).toBe("Venusaur ex");
  });

  it("takes the longest species, so Mewtwo is not Mew and Yanmega no Mega Yanma", () => {
    expect(fromName("ミュウツーex")).toBe("Mewtwo ex");
    expect(fromName("ミュウex")).toBe("Mew ex");
    expect(fromName("メガヤンマex")).toBe("Yanmega ex");
  });

  it("splits a tag team at the ampersand", () => {
    expect(fromName("ミュウツー&ミュウGX")).toBe("Mewtwo & Mew GX");
  });

  it("reads the species after the owner", () => {
    expect(fromName("ブルーノのカイリキー")).toBe("Bruno's Machamp");
  });

  it("is null for anything but a Pokémon, whatever species its name holds", () => {
    expect(fromName("ポケモンファンクラブ", "Trainer")).toBeNull();
    expect(fromName("ブルーノのテクニカルマシン01", "Trainer")).toBeNull();
  });

  it("is null where no species is written in the name", () => {
    expect(fromName("博士の研究")).toBeNull();
    expect(fromName("")).toBeNull();
    expect(englishFromLocalName("de", "Bisasam", local, species, "Pokemon")).toBeNull();
  });
});

describe("keepsStoredName", () => {
  it("keeps a stored name that only adds words the rules cannot read", () => {
    expect(keepsStoredName("Victini ◇", "Victini")).toBe(true);
    expect(keepsStoredName("Tohoku's Pikachu", "Pikachu")).toBe(true);
    expect(keepsStoredName("Lillie's Determination", null, { pokemon: false, species })).toBe(true);
  });

  it("replaces a doubled, garbled, short or other card's name", () => {
    expect(keepsStoredName("Clefable Clefable", "Clefable")).toBe(false);
    expect(keepsStoredName("Hitmonchan s Hitmonchan ex", "Rocket's Hitmonchan ex")).toBe(false);
    expect(keepsStoredName("Nidoran♀ f", "Nidoran♀")).toBe(false);
    expect(keepsStoredName("Nidoran♀ nidoranf", "Nidoran♀")).toBe(false);
    expect(keepsStoredName("Unown d", "Unown D")).toBe(false);
    expect(keepsStoredName("Machamp", "Bruno's Machamp")).toBe(false);
    expect(keepsStoredName("Melmetal GX", "Lucario & Melmetal GX")).toBe(false);
    expect(keepsStoredName("Slurpuff", "Swirlix")).toBe(false);
  });

  it("drops a species name from a trainer", () => {
    expect(keepsStoredName("Krabby", null, { pokemon: false, species })).toBe(false);
  });
});

describe("printedNameOf", () => {
  const of = (setId: string, localName: string | null, name: string, category = "Pokemon") =>
    printedNameOf(setId, localName, name, category, species, local);

  it("drops a vintage set's Latin or machine-translated printed name", () => {
    expect(of("E1", "Clefable", "Clefable")).toBeNull();
    expect(of("E1", "おしっこ", "Machamp")).toBeNull();
    expect(of("VS1", "ブルーノのカイリキー", "Bruno's Machamp")).toBe("ブルーノのカイリキー");
  });

  it("keeps every printed name outside those sets, and a trainer's", () => {
    expect(of("SV2a", "Clefable", "Clefable")).toBe("Clefable");
    expect(of("E2", "ポケモンファンクラブ", "Pokémon Fan Club", "Trainer")).toBe(
      "ポケモンファンクラブ",
    );
    expect(of("E1", null, "Clefable")).toBeNull();
  });
});

describe("printedStyleName", () => {
  it("writes XY's EX and its Megas as the English cards print them", () => {
    expect(printedStyleName("XY8b", "M Houndoom Ex")).toBe("M Houndoom-EX");
    expect(printedStyleName("CP4", "Mega Gengar EX")).toBe("M Gengar-EX");
    expect(printedStyleName("XY4", "M Manectric ex- 024/088")).toBe("M Manectric-EX");
    expect(printedStyleName("XY8a", "Mewtwo EX")).toBe("Mewtwo-EX");
  });

  it("writes Sun & Moon's GX with a hyphen, tag teams and Mega tag teams included", () => {
    expect(printedStyleName("SM10", "Reshiram & Charizard GX")).toBe("Reshiram & Charizard-GX");
    expect(printedStyleName("SM12", "Mega Lopunny & Jigglypuff GX")).toBe(
      "Mega Lopunny & Jigglypuff-GX",
    );
  });

  it("writes the ADV and PCG ex, δ and gold star as those cards do", () => {
    expect(printedStyleName("PCG9", "Rayquaza Ex（デルタ種）")).toBe("Rayquaza ex δ");
    expect(printedStyleName("PCG9", "Charizard Star δ")).toBe("Charizard ☆ δ");
    expect(printedStyleName("PCG2", "Latias Star")).toBe("Latias ☆");
    expect(printedStyleName("L2", "Ho-Oh Legend")).toBe("Ho-Oh LEGEND");
  });

  it("leaves the eras that print ex, V and Mega as written", () => {
    expect(printedStyleName("SV4a", "Charizard ex")).toBe("Charizard ex");
    expect(printedStyleName("S8", "Mew V")).toBe("Mew V");
    expect(printedStyleName("M1L", "Mega Lucario ex")).toBe("Mega Lucario ex");
    expect(printedStyleName("SM12a", "Victini ◇")).toBe("Victini ◇");
    expect(printedStyleName("neo2", "Unown [F]")).toBe("Unown F");
    expect(printedStyleName("neo1", "Farfetch’d")).toBe("Farfetch'd");
  });
});

describe("nameConventions", () => {
  // Naming pass against Bulbapedia's set lists, 2026-09-15.
  it("writes an Energy icon inside a name as its letter, Fire as R and Fairy as Y", () => {
    expect(nameConventions("Horror Psychic Energy")).toBe("Horror P Energy");
    expect(nameConventions("Heat Fire Energy")).toBe("Heat R Energy");
    expect(nameConventions("Unit Energy GrassFireWater")).toBe("Unit Energy GRW");
    expect(nameConventions("Unit Energy Fighting Darkness Fairy")).toBe("Unit Energy FDY");
    expect(nameConventions("Unit Energy GFW")).toBe("Unit Energy GRW");
    expect(nameConventions("Blend Energy Grass Fire Psychic Darkness")).toBe("Blend Energy GRPD");
    expect(nameConventions("Fairy Charm Dragon")).toBe("Fairy Charm N");
  });

  it("leaves a name whose words only look like it alone", () => {
    for (const name of ["Heat Rotom", "Rocky Helmet", "Fairy Charm UB", "Wash Rotom", "Poké Ball"])
      expect(nameConventions(name)).toBe(name);
  });

  it("brackets a Supporter's subtitle, drops Team Flare's Gear and keeps the accent", () => {
    expect(nameConventions("Professor's Research (Professor Magnolia)")).toBe(
      "Professor's Research [Professor Magnolia]",
    );
    expect(nameConventions("Boss's Orders - Ghetsis")).toBe("Boss's Orders [Ghetsis]");
    expect(nameConventions("Head Ringer Team Flare Hyper Gear")).toBe("Head Ringer");
    expect(nameConventions("Pok Kid")).toBe("Poké Kid");
    expect(nameConventions("PokStop")).toBe("PokéStop");
    expect(nameConventions("Pokegear 3.0")).toBe("Pokégear 3.0");
  });

  it("hyphenates GX and EX, signs Nidoran, and writes no em dash", () => {
    expect(nameConventions("Tapu Lele GX")).toBe("Tapu Lele-GX");
    expect(nameConventions("Dragonite EX")).toBe("Dragonite-EX");
    expect(nameConventions("Pikachu ex")).toBe("Pikachu ex");
    expect(nameConventions("NidoranM")).toBe("Nidoran♂");
    expect(nameConventions("Nidoran F")).toBe("Nidoran♀");
    expect(nameConventions("Delta Rainbow Energy")).toBe("δ Rainbow Energy");
    expect(nameConventions("Ancient Technical Machine Ice")).toBe(
      "Ancient Technical Machine [Ice]",
    );
    expect(nameConventions("Rotom Dex\u2014Poké Finder Mode")).toBe("Rotom Dex Poké Finder Mode");
  });

  it("is what printedStyleName ends with, whatever the set", () => {
    expect(printedStyleName("SV-P", "Tapu Lele GX")).toBe("Tapu Lele-GX");
    expect(printedStyleName("S8b", "Heat Fire Energy")).toBe("Heat R Energy");
  });
});
