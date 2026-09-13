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
  // TCGdex has photographed SV1a-007; the HEAD the Japanese path spends says so.
  "https://assets.tcgdex.net/ja/SV/SV1a/007/low.webp": true,
  // A card from a set TCGdex has recorded and not photographed — SV5M was 12 of 12 on
  // 2026-09-11 — carries an address with no file behind it.
  "/ja/cards/SV5M-001": {
    id: "SV5M-001",
    localId: "001",
    name: "ストライク",
    image: "https://assets.tcgdex.net/ja/SV/SV5M/001",
    set: { id: "SV5M", name: "サイバージャッジ" },
  },
  // And one whose record does not name a picture at all.
  "/ja/cards/SV5M-002": { id: "SV5M-002", localId: "002", name: "ハッサム", set: { id: "SV5M" } },
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
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const key = url.replace("https://api.tcgdex.net/v2", "");
    asked.push(init?.method === "HEAD" ? `HEAD ${key}` : key);
    const body = { ...answers, ...extra }[key];
    if (body === true) return new Response("", { status: 200 });
    return new Response(body ? JSON.stringify(body) : "", { status: body ? 200 : 404 });
  });
  return asked;
};

describe("cataloguesFor", () => {
  it("sends only Japanese, the one language with a catalogue of its own", () => {
    expect(cataloguesFor("ja")).toEqual(["ja"]);
    // A German copy is an English card printed in German: same catalogue, same
    // ids, so it resolves the way it always did and never reaches this path.
    expect(cataloguesFor("de")).toEqual([]);
    expect(cataloguesFor("en")).toEqual([]);
    expect(cataloguesFor(null)).toEqual([]);
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
  it("answers a Japanese card whole: picture, rarity, name and set", async () => {
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
  });

  // Every price in Card Orb is TCGplayer's (2026-09-13). TCGdex relays Cardmarket's figures for a
  // Japanese card and no TCGplayer ones, so the record's pricing is not read at all: the price
  // comes from TCGplayer's Japanese shelf, in collection.ts.
  it("reads nothing of Cardmarket's off the record", async () => {
    stub();
    const card = await languageCard(["ja"], "SV1a-007");
    expect(card).not.toHaveProperty("price");
    expect(card).not.toHaveProperty("holo");
    expect(JSON.stringify(card)).not.toContain("0.17");
  });

  it("keeps TCGdex's own scan where the file is there, after one probe", async () => {
    const asked = stub();
    const card = await languageCard(["ja"], "SV1a-007");
    expect(card!.scan).toBeNull();
    expect(asked).toEqual([
      "/ja/cards/SV1a-007",
      "HEAD https://assets.tcgdex.net/ja/SV/SV1a/007/low.webp",
    ]);
  });

  it("names Limitless's pair where TCGdex has the card and not its picture", async () => {
    stub();
    const card = await languageCard(["ja"], "SV5M-001");
    const cover = (f: string) =>
      `/api/cover?url=${encodeURIComponent(`https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/SV5M/${f}`)}`;
    expect(card!.scan).toEqual({
      low: cover("SV5M_1_R_JP_SM.png"),
      high: cover("SV5M_1_R_JP_LG.png"),
    });
    // TCGdex's address is still carried, as the row's record of where it looked.
    expect(card!.image).toBe("https://assets.tcgdex.net/ja/SV/SV5M/001");
  });

  it("names Limitless's pair, without a probe, for a set TCGdex photographed in its reverse variant", async () => {
    // Pokémon Card 151: TCGdex's file is there and it is the Master Ball print of every card.
    const asked = stub({
      "/ja/cards/SV2a-011": {
        id: "SV2a-011",
        localId: "011",
        name: "トランセル",
        image: "https://assets.tcgdex.net/ja/SV/SV2a/011",
        set: { id: "SV2a", name: "ポケモンカード151" },
      },
    });
    const card = await languageCard(["ja"], "SV2a-011");
    expect(card!.scan?.low).toContain("SV2a_11_R_JP_SM.png");
    expect(asked).toEqual(["/ja/cards/SV2a-011"]);
  });

  it("guesses without a probe where the record names no picture at all", async () => {
    const asked = stub();
    const card = await languageCard(["ja"], "SV5M-002");
    expect(card!.scan?.low).toContain("SV5M_2_R_JP_SM.png");
    expect(asked).toEqual(["/ja/cards/SV5M-002"]);
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
