import { afterEach, describe, expect, it, vi } from "vitest";
import { cataloguesFor, isTcgId, languageCard, languageSet, setIdOf } from "./tcgdex-language";

const answers: Record<string, unknown> = {
  "/ja/cards/SV1a-007": {
    id: "SV1a-007",
    localId: "007",
    name: "マスカーニャex",
    rarity: "Double rare",
    image: "https://assets.tcgdex.net/ja/SV/SV1a/007",
    set: { id: "SV1a", name: "トリプレットビート", cardCount: { official: 73, total: 103 } },
    pricing: {
      cardmarket: { low: 0.05, trend: 0.17, avg30: 0.28, "trend-holo": 0 },
      tcgplayer: null,
    },
  },
  // A Chinese card Cardmarket does not price at all, and only the simplified
  // catalogue has it: both halves of what makes zh awkward, in one card.
  "/zh-cn/cards/CS3aC-010": {
    id: "CS3aC-010",
    localId: "010",
    name: "妙蛙种子",
    image: "https://assets.tcgdex.net/zh-cn/CS/CS3aC/010",
    set: { id: "CS3aC", name: "朱＆紫" },
  },
  "/ja/sets/SV1a": {
    id: "SV1a",
    name: "トリプレットビート",
    releaseDate: "2023-03-10",
    cardCount: { official: 73, total: 103 },
  },
};

afterEach(() => vi.unstubAllGlobals());

const stub = (extra: Record<string, unknown> = {}) => {
  const asked: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    const key = url.replace("https://api.tcgdex.net/v2", "");
    asked.push(key);
    const body = { ...answers, ...extra }[key];
    return new Response(body ? JSON.stringify(body) : "", { status: body ? 200 : 404 });
  });
  return asked;
};

describe("cataloguesFor", () => {
  it("sends only the four languages that have a catalogue of their own", () => {
    expect(cataloguesFor("ja")).toEqual(["ja"]);
    expect(cataloguesFor("ko")).toEqual(["ko"]);
    // A German copy is an English card printed in German: same catalogue, same
    // ids, so it resolves the way it always did and never reaches this path.
    expect(cataloguesFor("de")).toEqual([]);
    expect(cataloguesFor("en")).toEqual([]);
    expect(cataloguesFor(null)).toEqual([]);
  });

  it("tries both Chinese catalogues, traditional first", () => {
    expect(cataloguesFor("zh")).toEqual(["zh-tw", "zh-cn"]);
  });
});

describe("setIdOf", () => {
  it("splits at the last dash, so a set id may hold one", () => {
    expect(setIdOf("SV1a-007")).toBe("SV1a");
    expect(setIdOf("sv03.5-100")).toBe("sv03.5");
    // The Japanese promos. Splitting at the first dash would call the set "S".
    expect(setIdOf("S-P-051")).toBe("S-P");
    expect(setIdOf("nonsense")).toBeNull();
  });
});

describe("isTcgId", () => {
  it("refuses anything that could not be a path segment", () => {
    expect(isTcgId("SV1a-007")).toBe(true);
    expect(isTcgId("swsh12.5gg-GG01")).toBe(true);
    expect(isTcgId("../../sets")).toBe(false);
    expect(isTcgId("sv1")).toBe(false);
    expect(isTcgId("")).toBe(false);
    expect(isTcgId(null)).toBe(false);
  });
});

describe("languageCard", () => {
  it("answers a Japanese card whole: picture, rarity and Cardmarket's euros", async () => {
    stub();
    const card = await languageCard(["ja"], "SV1a-007");
    expect(card).toMatchObject({
      catalogue: "ja",
      id: "SV1a-007",
      number: "007",
      name: "マスカーニャex",
      rarity: "Double rare",
      image: "https://assets.tcgdex.net/ja/SV/SV1a/007",
      setId: "SV1a",
      setName: "トリプレットビート",
    });
    expect(card!.price?.market).toBeCloseTo(0.17);
    // trend-holo: 0 is Cardmarket saying it has no foil listing, not that the
    // foil is free. The same rule the English path reads it by.
    expect(card!.holo).toBeNull();
  });

  it("falls through to simplified when traditional does not have the card", async () => {
    const asked = stub();
    const card = await languageCard(["zh-tw", "zh-cn"], "CS3aC-010");
    expect(card?.catalogue).toBe("zh-cn");
    expect(asked).toEqual(["/zh-tw/cards/CS3aC-010", "/zh-cn/cards/CS3aC-010"]);
  });

  it("reads a card no market prices as unpriced, never as free", async () => {
    stub();
    const card = await languageCard(["zh-cn"], "CS3aC-010");
    expect(card).not.toBeNull();
    expect(card!.price).toBeNull();
    expect(card!.holo).toBeNull();
  });

  it("is null for a card no catalogue in the list has", async () => {
    stub();
    expect(await languageCard(["ja"], "SV1a-999")).toBeNull();
  });

  it("refuses an id that is not one rather than asking for it", async () => {
    const asked = stub();
    expect(await languageCard(["ja"], "../../sets")).toBeNull();
    expect(asked).toEqual([]);
  });

  it("throws when TCGdex will not answer, so nothing caches a card with no picture", async () => {
    vi.stubGlobal("fetch", async () => new Response("", { status: 503 }));
    await expect(languageCard(["ja"], "SV1a-007")).rejects.toThrow();
  });
});

describe("languageSet", () => {
  it("answers the release date the card's own record does not carry", async () => {
    stub();
    expect(await languageSet("ja", "SV1a")).toEqual({
      name: "トリプレットビート",
      releaseDate: "2023-03-10",
      total: 73,
    });
  });

  it("is null for a set the catalogue does not name, rather than a failure", async () => {
    stub();
    expect(await languageSet("ja", "NOPE")).toBeNull();
  });
});
