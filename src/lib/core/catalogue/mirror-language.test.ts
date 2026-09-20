import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const listSetsIn = vi.fn();
const setIn = vi.fn();
vi.mock("./tcgdex-browse", () => ({
  listSetsIn: (...a: unknown[]) => listSetsIn(...a),
  setIn: (...a: unknown[]) => setIn(...a),
}));

class CatalogueNotFound extends Error {
  name = "CatalogueNotFound";
}
const json = vi.fn();
vi.mock("./tcgdex-client", () => ({ CatalogueNotFound, json: (...a: unknown[]) => json(...a) }));

/** Which TCGdex scans have a file behind them. */
const tcgdexScan = vi.fn(async (stem: string): Promise<string | null> => stem);
vi.mock("./artwork", async (actual) => ({
  ...(await actual<typeof import("./artwork")>()),
  tcgdexScan: (stem: string) => tcgdexScan(stem),
}));

const canStoreImages = vi.fn(async () => false);
const keepImage = vi.fn(async (a: string | null) => a);
vi.mock("./image-store", async (actual) => ({
  isOurs: (await actual<typeof import("./image-store")>()).isOurs,
  heldUnlessOurs: (await actual<typeof import("./image-store")>()).heldUnlessOurs,
  canStoreImages: () => canStoreImages(),
  keepImage: (a: string | null) => keepImage(a),
  storedAddress: () => null,
}));
const scrydexJapanExpansions = vi.fn(async (): Promise<unknown[]> => [
  { name: "Pokémon Card 151", code: "sv2a_ja" },
]);
vi.mock("./scrydex-japan-logos", async (actual) => ({
  ...(await actual<typeof import("./scrydex-japan-logos")>()),
  scrydexJapanExpansions: () => scrydexJapanExpansions(),
  scrydexExpansionCards: async () => [],
  scrydexRealLogo: async (address: string | null) => address,
}));
const japanGroups = vi.fn(async (): Promise<unknown[]> => []);
const groupCards = vi.fn(async (): Promise<unknown[]> => []);
vi.mock("./tcgplayer-japan", async (actual) => ({
  ...(await actual<typeof import("./tcgplayer-japan")>()),
  japanGroups: () => japanGroups(),
  groupCards: () => groupCards(),
}));
/** What Scrydex knows, as scripts/scrydex-japan-cards.mjs writes it. */
const scrydexMap = vi.hoisted(() => ({
  cards: {
    "XY8b-006": { n: "M Houndoom-EX", j: "MヘルガーEX", m: "SR", a: "5ban Graphics" },
    "SV4a-006": { n: "Charizard ex", j: "リザードンex", m: "none", a: "PLANETA" },
    "SV4a-127": {
      n: "Shroodle",
      j: "シルシュルー",
      m: "C",
      a: "Kurata So",
      c: "Pokemon",
      s: "Basic",
      t: ["Darkness"],
      h: 60,
      p: "127/190",
      x: 1,
    },
  },
  sets: { SV4a: { code: "sv4a_ja", cards: 2 }, PCG10: { code: "pcg10_ja", cards: 108 } },
}));
vi.mock("../scrydex-cards.ja.generated.json", () => ({ default: scrydexMap }));
vi.mock("./mirror", () => ({
  CATALOGUE_FORMAT: 1,
  ownArt: async (a: string | null) => a,
}));

const { syncLanguageMirror } = await import("./mirror-language");

type Call = { table: string; op: string; args: unknown[] };
function fakeStore(seed: Record<string, unknown[]> = {}) {
  const calls: Call[] = [];
  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const op of ["select", "eq", "in", "lt", "order", "range", "upsert", "delete"])
      chain[op] = (...args: unknown[]) => {
        calls.push({ table, op, args });
        return chain;
      };
    chain.then = (resolve: (v: unknown) => unknown) => {
      const data = seed[table] ?? [];
      return resolve({ data, error: null, count: data.length });
    };
    return chain;
  };
  return { db: { from } as unknown as SupabaseClient, calls };
}

const shelfSet = (id: string, total = 1) => ({
  id,
  name: `Set ${id}`,
  localName: `セット ${id}`,
  series: "Scarlet & Violet",
  releaseDate: null,
  total,
  printedTotal: total,
  cardsRecorded: true,
  logo: null,
  symbol: null,
});

const card = (id: string, number: string) => ({
  id,
  number,
  name: "Charizard ex",
  localName: "リザードンex",
  setName: "ignored",
  image: `https://assets.tcgdex.net/ja/SV/${id.split("-")[0]}/${number}/low.webp`,
  imageHigh: null,
  rarity: null,
  types: [],
  series: "Scarlet & Violet",
  tcgId: id,
});

beforeEach(() => {
  vi.clearAllMocks();
  scrydexJapanExpansions.mockResolvedValue([{ name: "Pokémon Card 151", code: "sv2a_ja" }]);
  japanGroups.mockResolvedValue([]);
  groupCards.mockResolvedValue([]);
  keepImage.mockImplementation(async (a: string | null) => a);
  tcgdexScan.mockImplementation(async (stem: string) => stem);
  canStoreImages.mockResolvedValue(false);
  json.mockResolvedValue({
    rarity: "Double rare",
    types: ["Fire"],
    category: "Pokemon",
    illustrator: "PLANETA",
    hp: 330,
    stage: "Stage2",
    evolveFrom: "Charmeleon",
    regulationMark: "G",
    variants: { firstEdition: false },
    variants_detailed: [{ type: "holo", size: "standard" }],
  });
  setIn.mockImplementation(async (_lang: string, id: string) => ({
    set: { ...shelfSet(id), releaseDate: "2023/06/16", serieId: "SV" },
    cards: [card(`${id}-006`, "006")],
  }));
});

describe("syncLanguageMirror", () => {
  it("copies a Japanese set into the shared copy under its own language", async () => {
    listSetsIn.mockResolvedValue([shelfSet("SV2a")]);
    const { db, calls } = fakeStore();
    const report = await syncLanguageMirror(db, "ja", { parallel: 1 });
    expect(report.copied).toEqual(["SV2a"]);

    const setRow = calls.find((c) => c.table === "catalogue_sets" && c.op === "upsert");
    expect(setRow?.args[0]).toMatchObject({
      language: "ja",
      id: "SV2a",
      name: "Set SV2a",
      local_name: "セット SV2a",
      serie_id: "SV",
      cards_recorded: true,
      sort_order: 0,
      // Scrydex's wordmark for Pokémon Card 151, by the set's id.
      logo: "https://images.scrydex.com/pokemon/sv2a_ja-logo/logo",
    });
    expect(setRow?.args[1]).toEqual({ onConflict: "language,id" });

    const cardRows = calls.find((c) => c.table === "catalogue_cards" && c.op === "upsert");
    expect(cardRows?.args[1]).toEqual({ onConflict: "language,id" });
    expect(cardRows?.args[0]).toEqual([
      expect.objectContaining({
        language: "ja",
        id: "SV2a-006",
        name: "Charizard ex",
        local_name: "リザードンex",
        rarity: "Double Rare",
        types: ["Fire"],
        illustrator: "PLANETA",
        hp: 330,
        evolve_from: "Charmeleon",
        variants: [{ type: "holo" }],
        languages: null,
      }),
    ]);
    const stamped = calls.find((c) => c.table === "catalogue_sync" && c.op === "upsert");
    expect(stamped?.args[0]).toMatchObject({ language: "ja", set_id: "SV2a", format: 8 });
  });

  /* On 2026-09-15 Scrydex's expansions page answered 524 and a run wrote all 169 Japanese sets
     without their logo. */
  it("keeps a logo held in our bucket without asking Scrydex", async () => {
    listSetsIn.mockResolvedValue([shelfSet("SV2a")]);
    const held = "https://images.cardorb.com/scrydex/logos/sv2a_ja.png";
    const { db, calls } = fakeStore({ catalogue_sets: [{ id: "SV2a", logo: held }] });
    await syncLanguageMirror(db, "ja", { parallel: 1 });

    const setRow = calls.find((c) => c.table === "catalogue_sets" && c.op === "upsert");
    expect(setRow?.args[0]).toMatchObject({ id: "SV2a", logo: held });
    expect(scrydexJapanExpansions).not.toHaveBeenCalled();
  });

  it("keeps a card picture and a symbol held in our bucket where the run finds nothing of ours", async () => {
    listSetsIn.mockResolvedValue([shelfSet("SV2a")]);
    canStoreImages.mockResolvedValue(false);
    const picture = "https://images.cardorb.com/limitless/SV2a_006.png";
    const symbol = "https://images.cardorb.com/ja/SV/SV2a/symbol.png";
    const { db, calls } = fakeStore({
      catalogue_sets: [{ id: "SV2a", logo: null, symbol }],
      catalogue_cards: [{ id: "SV2a-006", image: picture }],
    });
    await syncLanguageMirror(db, "ja", { parallel: 1 });
    expect(
      calls.find((c) => c.table === "catalogue_sets" && c.op === "upsert")?.args[0],
    ).toMatchObject({ symbol });
    expect(
      (
        calls.find((c) => c.table === "catalogue_cards" && c.op === "upsert")?.args[0] as {
          image: string;
        }[]
      )[0],
    ).toMatchObject({ image: picture });
  });

  it("takes the Scrydex code on file, or keeps the held logo, where Scrydex's page does not answer", async () => {
    scrydexJapanExpansions.mockRejectedValue(new Error("Scrydex expansions: 524"));
    listSetsIn.mockResolvedValue([shelfSet("SV4a"), shelfSet("SV2a")]);
    const held = "https://images.cardorb.com/scrydex/logos/sv2a_ja.png";
    const { db, calls } = fakeStore({ catalogue_sets: [{ id: "SV2a", logo: held }] });
    await syncLanguageMirror(db, "ja", { parallel: 1 });

    const logos = Object.fromEntries(
      calls
        .filter((c) => c.table === "catalogue_sets" && c.op === "upsert")
        .map((c) => {
          const row = c.args[0] as { id: string; logo: string | null };
          return [row.id, row.logo];
        }),
    );
    expect(logos).toEqual({
      SV4a: "https://images.scrydex.com/pokemon/sv4a_ja-logo/logo",
      SV2a: held,
    });
  });

  /* XY8b-061 M Houndoom-EX was "M Houndoom Ex" with no artist; SM2p-050 Tapu Bulu GX prints SR and
     read Ultra Rare (2026-09-14). */
  it("writes the printed mark, Scrydex's artist and the English game's name", async () => {
    listSetsIn.mockResolvedValue([shelfSet("XY8b")]);
    json.mockResolvedValue({ rarity: "Ultra Rare", category: "Pokemon", illustrator: null });
    setIn.mockImplementation(async (_lang: string, id: string) => ({
      set: { ...shelfSet(id), serieId: "XY" },
      cards: [{ ...card(`${id}-006`, "006"), name: "Houndoom" }],
    }));
    const { db, calls } = fakeStore();
    await syncLanguageMirror(db, "ja", { parallel: 1 });
    const rows = calls.find((c) => c.table === "catalogue_cards" && c.op === "upsert")?.args[0];
    expect(rows).toEqual([
      expect.objectContaining({
        id: "XY8b-006",
        name: "M Houndoom-EX",
        rarity: "Super Rare",
        illustrator: "5ban Graphics",
      }),
    ]);
  });

  it("has no rarity where the card prints no mark, and an evolution in English", async () => {
    listSetsIn.mockResolvedValue([shelfSet("SV4a")]);
    json.mockResolvedValue({
      rarity: "None",
      category: "Pokemon",
      stage: "Stage 2",
      evolveFrom: "リザード",
    });
    const { db, calls } = fakeStore();
    await syncLanguageMirror(db, "ja", { parallel: 1 });
    const rows = calls.find((c) => c.table === "catalogue_cards" && c.op === "upsert")
      ?.args[0] as Record<string, unknown>[];
    expect(rows.find((r) => r.id === "SV4a-006")).toMatchObject({
      rarity: null,
      stage: "Stage2",
      evolve_from: "Charmeleon",
    });
  });

  // Shiny Treasure ex's 127 to 166 are on Scrydex and not at TCGdex (2026-09-14).
  it("adds the cards Scrydex lists and TCGdex does not, and counts them in the set's total", async () => {
    listSetsIn.mockResolvedValue([shelfSet("SV4a")]);
    const { db, calls } = fakeStore();
    await syncLanguageMirror(db, "ja", { parallel: 1 });
    const rows = calls.find((c) => c.table === "catalogue_cards" && c.op === "upsert")
      ?.args[0] as Record<string, unknown>[];
    expect(rows.map((r) => r.id)).toEqual(["SV4a-006", "SV4a-127"]);
    expect(rows[1]).toMatchObject({
      local_id: "127",
      name: "Shroodle",
      local_name: "シルシュルー",
      rarity: "Common",
      category: "Pokemon",
      stage: "Basic",
      types: ["Darkness"],
      hp: 60,
      illustrator: "Kurata So",
    });
    expect(json).not.toHaveBeenCalledWith(expect.stringContaining("SV4a-127"), expect.anything());
    const setRow = calls.find((c) => c.table === "catalogue_sets" && c.op === "upsert");
    expect(setRow?.args[0]).toMatchObject({ id: "SV4a", total: 2 });
  });

  it("takes Limitless's plain print where TCGdex has no file, and TCGdex's where it has", async () => {
    listSetsIn.mockResolvedValue([shelfSet("SM12a")]);
    tcgdexScan.mockResolvedValue(null);
    const { db, calls } = fakeStore();
    await syncLanguageMirror(db, "ja", { parallel: 1 });
    const rows = calls.find((c) => c.table === "catalogue_cards" && c.op === "upsert")?.args[0] as {
      image: string;
    }[];
    expect(decodeURIComponent(rows[0]!.image)).toContain("tpc/SM12a/SM12a_6_R_JP_LG.png");
  });

  it("never keeps TCGdex's scan of a set it photographed in reverse", async () => {
    listSetsIn.mockResolvedValue([shelfSet("SV2a")]);
    const { db, calls } = fakeStore();
    await syncLanguageMirror(db, "ja", { parallel: 1 });
    const rows = calls.find((c) => c.table === "catalogue_cards" && c.op === "upsert")?.args[0] as {
      image: string;
    }[];
    expect(tcgdexScan).not.toHaveBeenCalled();
    expect(decodeURIComponent(rows[0]!.image)).toContain("limitless");
  });

  it("writes no picture where the bucket could not keep one", async () => {
    listSetsIn.mockResolvedValue([shelfSet("SM12a")]);
    tcgdexScan.mockResolvedValue(null);
    canStoreImages.mockResolvedValue(true);
    const { db, calls } = fakeStore();
    await syncLanguageMirror(db, "ja", { parallel: 1 });
    const rows = calls.find((c) => c.table === "catalogue_cards" && c.op === "upsert")?.args[0] as {
      image: string | null;
    }[];
    expect(rows[0]!.image).toBeNull();
  });

  // PCG10 011, Flareon ☆: no TCGdex file, no Limitless or TCGplayer picture, and a Scrydex page the
  // name match could not read in time. Its Scrydex number is kept by hand.
  it("takes Scrydex's scan at a number read by hand, when Scrydex's pages do not answer", async () => {
    listSetsIn.mockResolvedValue([shelfSet("PCG10")]);
    setIn.mockResolvedValue({
      set: { ...shelfSet("PCG10"), serieId: "PCG" },
      cards: [card("PCG10-011", "011")],
    });
    scrydexJapanExpansions.mockRejectedValue(new Error("timeout"));
    tcgdexScan.mockResolvedValue(null);
    canStoreImages.mockResolvedValue(true);
    keepImage.mockImplementation(async (a: string | null) =>
      a === "https://images.scrydex.com/pokemon/pcg10_ja-11/large"
        ? "https://images.cardorb.com/scrydex/pcg10_ja-11.png"
        : a,
    );
    vi.stubGlobal(
      "fetch",
      async () => new Response(null, { status: 200, headers: { etag: '"a-real-scan"' } }),
    );
    const { db, calls } = fakeStore();
    await syncLanguageMirror(db, "ja", { parallel: 1 });
    vi.unstubAllGlobals();
    const rows = calls.find((c) => c.table === "catalogue_cards" && c.op === "upsert")?.args[0] as {
      image: string | null;
    }[];
    expect(rows[0]!.image).toBe("https://images.cardorb.com/scrydex/pcg10_ja-11.png");
  });

  // SV-P 022: a promo, whose number is no file name at Limitless; TCGplayer's Japanese shelf sells
  // it as product 587779 (tcgplayer-ids.ja.generated.json).
  it("keeps TCGplayer's product picture where neither TCGdex nor Limitless has the card", async () => {
    listSetsIn.mockResolvedValue([shelfSet("SV-P")]);
    setIn.mockResolvedValue({
      set: { ...shelfSet("SV-P"), serieId: "SV" },
      cards: [card("SV-P-022", "022")],
    });
    tcgdexScan.mockResolvedValue(null);
    canStoreImages.mockResolvedValue(true);
    keepImage.mockImplementation(async (a: string | null) =>
      a?.includes("tcgplayer-cdn") ? "https://images.cardorb.com/tcgplayer/587779.jpg" : a,
    );
    vi.stubGlobal("fetch", async () => new Response(null, { status: 200 }));
    const { db, calls } = fakeStore();
    await syncLanguageMirror(db, "ja", { parallel: 1 });
    vi.unstubAllGlobals();
    const rows = calls.find((c) => c.table === "catalogue_cards" && c.op === "upsert")?.args[0] as {
      image: string | null;
    }[];
    expect(rows[0]!.image).toBe("https://images.cardorb.com/tcgplayer/587779.jpg");
  });

  it("fills a set TCGdex lists without cards from TCGplayer's Japanese shelf", async () => {
    listSetsIn.mockResolvedValue([{ ...shelfSet("S4a"), name: "Shiny Star V" }]);
    setIn.mockResolvedValue({
      set: { ...shelfSet("S4a"), name: "Shiny Star V", cardsRecorded: false, serieId: "S" },
      cards: [],
    });
    japanGroups.mockResolvedValue([
      { groupId: 23643, name: "S4a: Shiny Star V", abbreviation: "S4a" },
    ]);
    groupCards.mockResolvedValue([
      {
        productId: 578001,
        number: "003",
        name: "Charizard V",
        rarity: "Double Rare",
        cardType: "Fire",
        hp: 220,
        stage: "Basic",
        image: "https://tcgplayer-cdn.tcgplayer.com/product/578001_in_1000x1000.jpg",
      },
    ]);
    const { db, calls } = fakeStore();
    const report = await syncLanguageMirror(db, "ja", { parallel: 1 });
    expect(report.copied).toEqual(["S4a"]);
    expect(json).not.toHaveBeenCalled();
    const rows = calls.find((c) => c.table === "catalogue_cards" && c.op === "upsert")?.args[0];
    expect(rows).toEqual([
      expect.objectContaining({
        id: "S4a-003",
        local_id: "003",
        name: "Charizard V",
        rarity: "Double Rare",
        types: ["Fire"],
        category: "Pokemon",
        hp: 220,
        tcgplayer_product_id: 578001,
        image: "https://tcgplayer-cdn.tcgplayer.com/product/578001_in_1000x1000.jpg",
      }),
    ]);
    expect(
      calls.find((c) => c.table === "catalogue_sets" && c.op === "upsert")?.args[0],
    ).toMatchObject({
      id: "S4a",
      cards_recorded: true,
    });
  });

  /* jumbo, rc, sp and wp carried cards_recorded on nothing at all: TCGdex publishes `cards: []`
     for them and the run wrote the catalogue's claim rather than what it had written down. The
     shelf and the set page both go by the flag (migration 20260920110000). */
  it("marks a set with no cards written as not recorded", async () => {
    listSetsIn.mockResolvedValue([{ ...shelfSet("rc"), name: "Radiant Collection" }]);
    setIn.mockResolvedValue({
      set: { ...shelfSet("rc"), name: "Radiant Collection", cardsRecorded: false, serieId: "SV" },
      cards: [],
    });
    const { db, calls } = fakeStore();
    await syncLanguageMirror(db, "ja", { parallel: 1 });
    expect(
      calls.find((c) => c.table === "catalogue_sets" && c.op === "upsert")?.args[0],
    ).toMatchObject({ id: "rc", cards_recorded: false });
  });

  it("builds no set from a TCGplayer group another set with TCGdex cards already reads", async () => {
    listSetsIn.mockResolvedValue([
      { ...shelfSet("SM3p"), name: "Shining Legends", cardsRecorded: true },
      { ...shelfSet("SM3+"), name: "Shining Legends", cardsRecorded: false },
    ]);
    setIn.mockImplementation(async (_l: string, id: string) =>
      id === "SM3+"
        ? { set: { ...shelfSet(id), name: "Shining Legends", cardsRecorded: false }, cards: [] }
        : { set: { ...shelfSet(id), name: "Shining Legends" }, cards: [card(`${id}-001`, "001")] },
    );
    japanGroups.mockResolvedValue([
      { groupId: 2208, name: "SM3+: Shining Legends", abbreviation: "SM3+" },
    ]);
    groupCards.mockResolvedValue([
      {
        productId: 1,
        number: "001",
        name: "Pikachu",
        rarity: null,
        cardType: null,
        hp: null,
        stage: null,
        image: "x",
      },
    ]);
    const { db, calls } = fakeStore();
    await syncLanguageMirror(db, "ja", { parallel: 1 });
    const upserts = calls.filter((c) => c.table === "catalogue_cards" && c.op === "upsert");
    const ids = upserts.flatMap((u) => (u.args[0] as { id: string }[]).map((r) => r.id));
    expect(ids).toEqual(["SM3p-001"]);
  });

  it("leaves a set for the next run where a card's record could not be read", async () => {
    listSetsIn.mockResolvedValue([shelfSet("SV1a")]);
    json.mockRejectedValue(new Error("TCGdex answered 503"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { db, calls } = fakeStore();
    const report = await syncLanguageMirror(db, "ja", { parallel: 1 });
    expect(report.failed).toEqual(["SV1a"]);
    expect(calls.some((c) => c.table === "catalogue_cards" && c.op === "upsert")).toBe(false);
  });

  it("copies a set it has never seen ahead of one it holds, and one in an older shape next", async () => {
    listSetsIn.mockResolvedValue([shelfSet("held"), shelfSet("behind"), shelfSet("new")]);
    const { db } = fakeStore({
      catalogue_sync: [
        { set_id: "held", cards: 1, synced_at: "2026-09-01T00:00:00Z", format: 8 },
        { set_id: "behind", cards: 1, synced_at: "2026-09-13T00:00:00Z", format: 7 },
      ],
    });
    const report = await syncLanguageMirror(db, "ja", { parallel: 1 });
    expect(report.copied).toEqual(["new", "behind", "held"]);
  });

  const tcgplayer = (productId: number, number: string | null, name: string) => ({
    productId,
    number,
    name,
    rarity: null,
    cardType: null,
    hp: null,
    stage: null,
    image: `https://tcgplayer-cdn.tcgplayer.com/product/${productId}_in_1000x1000.jpg`,
  });
  const upserted = (calls: Call[]) =>
    calls.find((c) => c.table === "catalogue_cards" && c.op === "upsert")?.args[0] as Record<
      string,
      unknown
    >[];

  // SM10-026 Krabby held Kingler's picture: TCGplayer numbers both 026/095 (2026-09-14).
  it("links the product whose name agrees and asks again for a picture of another product", async () => {
    listSetsIn.mockResolvedValue([{ ...shelfSet("SM10"), name: "Double Blaze" }]);
    setIn.mockResolvedValue({
      set: { ...shelfSet("SM10"), name: "Double Blaze", serieId: "SM" },
      cards: [{ ...card("SM10-026", "026"), name: "Krabby", localName: "クラブ" }],
    });
    japanGroups.mockResolvedValue([
      { groupId: 1, name: "SM10: Double Blaze", abbreviation: "SM10" },
    ]);
    groupCards.mockResolvedValue([
      tcgplayer(573624, "026", "Kingler"),
      tcgplayer(573625, "026", "Krabby"),
    ]);
    const { db, calls } = fakeStore({
      catalogue_cards: [
        { id: "SM10-026", image: "https://images.cardorb.com/tcgplayer/573624.jpg" },
      ],
    });
    await syncLanguageMirror(db, "ja", { parallel: 1 });
    const [row] = upserted(calls);
    expect(row).toMatchObject({ id: "SM10-026", tcgplayer_product_id: 573625 });
    expect(row!.image).not.toBe("https://images.cardorb.com/tcgplayer/573624.jpg");
  });

  it("keeps a held picture of the product the card still has", async () => {
    listSetsIn.mockResolvedValue([{ ...shelfSet("SM10"), name: "Double Blaze" }]);
    setIn.mockResolvedValue({
      set: { ...shelfSet("SM10"), name: "Double Blaze", serieId: "SM" },
      cards: [{ ...card("SM10-026", "026"), name: "Krabby", localName: "クラブ" }],
    });
    japanGroups.mockResolvedValue([
      { groupId: 1, name: "SM10: Double Blaze", abbreviation: "SM10" },
    ]);
    groupCards.mockResolvedValue([tcgplayer(573625, "026", "Krabby")]);
    const held = "https://images.cardorb.com/tcgplayer/573625.jpg";
    const { db, calls } = fakeStore({ catalogue_cards: [{ id: "SM10-026", image: held }] });
    await syncLanguageMirror(db, "ja", { parallel: 1 });
    expect(upserted(calls)[0]!.image).toBe(held);
  });

  // Fusion Arts prints Power Tablet at 126; TCGdex's record there is Training Court (2026-09-14).
  it("reads a card's name and facts from the record TCGdex files under another number", async () => {
    listSetsIn.mockResolvedValue([shelfSet("S8")]);
    setIn.mockResolvedValue({
      set: { ...shelfSet("S8"), serieId: "S" },
      cards: [
        { ...card("S8-126", "126"), name: "Training Court", localName: "トレーニングコート" },
        { ...card("S8-129", "129"), name: "Power Tablet", localName: "パワータブレット" },
      ],
    });
    json.mockImplementation(async (url: string) => ({
      category: "Trainer",
      trainerType: url.endsWith("S8-129") ? "Item" : "Stadium",
      rarity: "Ultra Rare",
    }));
    const { db, calls } = fakeStore();
    await syncLanguageMirror(db, "ja", { parallel: 1 });
    expect(upserted(calls)[0]).toMatchObject({
      id: "S8-126",
      local_id: "126",
      name: "Power Tablet",
      local_name: "パワータブレット",
      trainer_type: "Item",
    });
  });

  it("names a card TCGdex names only in Japanese after its product, and drops a machine translation", async () => {
    listSetsIn.mockResolvedValue([{ ...shelfSet("E1"), name: "Base Expansion Pack" }]);
    setIn.mockResolvedValue({
      set: { ...shelfSet("E1"), name: "Base Expansion Pack", serieId: "E" },
      cards: [
        { ...card("E1-069", "069"), name: "Weezing", localName: "おしっこ" },
        { ...card("E1-078", "078"), name: "ポケモンファンクラブ", localName: null },
      ],
    });
    json.mockImplementation(async (url: string) =>
      url.endsWith("E1-069") ? { category: "Pokemon" } : { category: "Trainer", rarity: "None" },
    );
    japanGroups.mockResolvedValue([{ groupId: 2, name: "Base Expansion Pack", abbreviation: "" }]);
    groupCards.mockResolvedValue([
      tcgplayer(10, "069", "Weezing"),
      tcgplayer(11, "078", "Pokemon Fan Club"),
    ]);
    const { db, calls } = fakeStore();
    await syncLanguageMirror(db, "ja", { parallel: 1 });
    expect(upserted(calls)).toEqual([
      expect.objectContaining({ id: "E1-069", name: "Weezing", local_name: null, rarity: null }),
      expect.objectContaining({
        id: "E1-078",
        // With the accent TCGplayer's product name drops (nameConventions).
        name: "Pokémon Fan Club",
        local_name: "ポケモンファンクラブ",
        tcgplayer_product_id: 11,
      }),
    ]);
  });
});
