import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const englishSets = vi.fn();
const englishSet = vi.fn();
/** Which numbers TCGdex names no scan for, and the set's printed code; none unless a test says so. */
const setScans = vi.fn(async (_setId: string) => ({
  gaps: new Set<string>(),
  code: null as string | null,
}));
vi.mock("./card-languages", () => ({ languagesOfSet: async () => () => ["en"] }));
/** Scrydex's logo for a set TCGdex has none for: none unless a test says so. */
const scrydexEnglishLogo = vi.fn(async (_id: string, _name?: string) => null as string | null);
vi.mock("./scrydex-japan-logos", () => ({
  scrydexEnglishLogo: (...a: unknown[]) => scrydexEnglishLogo(...(a as [string, string])),
}));
vi.mock("./tcgdex-browse", () => ({
  englishSets: () => englishSets(),
  englishSet: (...a: unknown[]) => englishSet(...a),
  englishSetScans: (...a: unknown[]) => setScans(...(a as [string])),
}));

/** Whether a built address holds a file, and what the two other catalogues have instead. */
const tcgdexScan = vi.fn(async (base: string) => base as string | null);
const limitlessScan = vi.fn(async () => null as string | null);
const ptcgScan = vi.fn(async () => null as string | null);
const tcgplayerScan = vi.fn(async () => null as string | null);
const scrydexScan = vi.fn(async () => null as string | null);
vi.mock("./artwork", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  tcgdexScan: (...a: unknown[]) => tcgdexScan(...(a as [string])),
  limitlessScan: (...a: unknown[]) => limitlessScan(...(a as [])),
  tcgplayerScan: (...a: unknown[]) => tcgplayerScan(...(a as [])),
  scrydexScan: (...a: unknown[]) => scrydexScan(...(a as [])),
}));
/** Our own bucket: off unless a test turns it on. */
const canStoreImages = vi.fn(async () => false);
const keepImage = vi.fn(async (address: string | null) => address);
const tcgdexFolderMissing = vi.fn(async (_stem: string) => false);
vi.mock("./image-store", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  canStoreImages: () => canStoreImages(),
  keepImage: (...a: unknown[]) => keepImage(...(a as [string | null])),
  tcgdexFolderMissing: (...a: unknown[]) => tcgdexFolderMissing(...(a as [string])),
}));
vi.mock("./ptcg", () => ({ ptcgScan: (...a: unknown[]) => ptcgScan(...(a as [])) }));
/* A set's logo is resolved against pokemontcg.io, a network read with its own tests; here the set
   keeps the logo it came with. */
vi.mock("./set-logos", () => ({ withSetLogos: async (sets: unknown[]) => sets }));
/* TCGplayer's product per card, a tcgcsv read with its own tests: none unless a test says so. */
const productFactsOf = vi.fn(async (_ids: string[]) => new Map<string, unknown>());
vi.mock("./tcgplayer-products", () => ({
  productFactsOf: (...a: unknown[]) => productFactsOf(...(a as [string[]])),
}));

const {
  CATALOGUE_FORMAT,
  buildIndex,
  catalogueIndex,
  forgetCopy,
  mirrorQuery,
  searchMirror,
  syncMirror,
  storeSetArt,
} = await import("./mirror");

type Call = { table: string; op: string; args: unknown[] };

/**
 * Just enough of PostgREST's builder to record what was asked, per table. Every method
 * returns the chain; awaiting it answers what the table was seeded with. `head: true` on
 * a select answers the count alone, which is how the copy's presence is asked.
 */
function fakeStore(seed: Record<string, unknown[]> = {}) {
  const calls: Call[] = [];
  const from = (table: string) => {
    let head = false;
    const chain: Record<string, unknown> = {};
    for (const op of [
      "update",
      "select",
      "ilike",
      "contains",
      "order",
      "range",
      "limit",
      "eq",
      "in",
      "lt",
      "upsert",
      "delete",
    ]) {
      chain[op] = (...args: unknown[]) => {
        calls.push({ table, op, args });
        if (op === "select" && (args[1] as { head?: boolean } | undefined)?.head) head = true;
        return chain;
      };
    }
    chain.then = (resolve: (v: unknown) => unknown) => {
      const data = seed[table] ?? [];
      return resolve({ data: head ? null : data, error: null, count: data.length });
    };
    return chain;
  };
  /* The search is one call to search_catalogue_cards now (migration 20260918090000), so the fake
     answers an rpc as PostgREST does: the rows seeded under "rpc", each already carrying the
     total the window function puts on them. */
  const rpc = (name: string, params: unknown) => {
    calls.push({ table: `rpc:${name}`, op: "rpc", args: [params] });
    const data = seed.rpc ?? [];
    return Promise.resolve({ data, error: null });
  };
  return { db: { from, rpc } as unknown as SupabaseClient, calls };
}

/** A row as search_catalogue_cards answers it: the card, and how many the whole search matched. */
const hitRow = (over: Record<string, unknown> = {}, total = 1) => ({
  ...row(over),
  local_name: null,
  category: null,
  trainer_type: null,
  full_art: false,
  total_count: total,
});

const row = (over: Record<string, unknown> = {}) => ({
  id: "sv03.5-006",
  set_id: "sv03.5",
  local_id: "006",
  name: "Charizard ex",
  set_name: "151",
  series: "Scarlet & Violet",
  release_date: "2023/09/22",
  rarity: "Double Rare",
  types: ["Fire"],
  image: "https://assets.tcgdex.net/en/sv/sv03.5/006",
  ...over,
});

beforeEach(() => forgetCopy());
afterEach(() => {
  englishSets.mockReset();
  englishSet.mockReset();
});

describe("mirrorQuery", () => {
  it("reads a term as words to match, with an energy type as the type filter", () => {
    expect(mirrorQuery("charizard fire 151")).toEqual({
      words: ["charizard", "151"],
      type: "Fire",
    });
  });

  it("keeps a second energy word as a word: one type filter, like the catalogue's", () => {
    expect(mirrorQuery("fire water")).toEqual({ words: ["water"], type: "Fire" });
  });

  it("caps the words, and asks nothing for nothing", () => {
    expect(mirrorQuery("a b c d e f g h")?.words).toHaveLength(6);
    expect(mirrorQuery("   ")).toBeNull();
  });

  /* "poke ball" found none of the 159 English cards whose name carries a diacritic until
     2026-09-18, "Poké Ball" among them: the copy held the name with its accent and matched the
     letters as they were typed. */
  it("drops a diacritic, because the copy's index holds the letter alone", () => {
    expect(mirrorQuery("Poké Ball")?.words).toEqual(["poke", "ball"]);
    expect(mirrorQuery("poke ball")?.words).toEqual(["poke", "ball"]);
    expect(mirrorQuery("Flabébé")?.words).toEqual(["flabebe"]);
  });

  /* The browser's own copy of the catalogue has read a hyphen as a space since cardorb-web #656,
     and its comment said this side did too. It did not: "shaymin ex" found Shaymin-EX in the
     browser and nothing through the API. */
  it("reads a hyphen as a space, so the two spellings are one question", () => {
    expect(mirrorQuery("shaymin-ex")?.words).toEqual(["shaymin", "ex"]);
    expect(mirrorQuery("shaymin ex")?.words).toEqual(["shaymin", "ex"]);
    expect(mirrorQuery("ho-oh")?.words).toEqual(["ho", "oh"]);
  });

  /* A name in its own script is what the Japanese shelf is searched by, and nothing in it is a
     Latin letter with a diacritic: the fold has to leave it exactly as typed or the copy's
     local_name never matches. */
  it("leaves a name in another script alone", () => {
    expect(mirrorQuery("リザードン")?.words).toEqual(["リザードン"]);
    expect(mirrorQuery("リザードン ex")?.words).toEqual(["リザードン", "ex"]);
  });

  it("folds the term before an energy word is looked for, so nothing is lost to the fold", () => {
    expect(mirrorQuery("Charizard Fire")).toEqual({ words: ["charizard"], type: "Fire" });
  });

  // Full art cuts across the rarities rather than being one of them, so it narrows whatever was
  // asked; on its own it is still a question, every full art in the catalogue.
  it("carries full art beside a term, and stands as a query on its own", () => {
    expect(mirrorQuery("charizard", { fullArt: true })).toEqual({
      words: ["charizard"],
      fullArt: true,
    });
    expect(mirrorQuery("   ", { fullArt: true })).toEqual({ words: [], fullArt: true });
    expect(mirrorQuery({ set: "151" }, { fullArt: true })).toEqual({
      words: [],
      set: "151",
      fullArt: true,
    });
  });

  it("takes the filter fields as typed, the type in the catalogue's spelling", () => {
    expect(mirrorQuery({ name: " char ", number: "6", set: "151", type: "fire" })).toEqual({
      words: [],
      name: "char",
      number: "6",
      set: "151",
      type: "Fire",
    });
    expect(mirrorQuery({ name: "  " })).toBeNull();
  });
});

describe("searchMirror", () => {
  /** The rpc's parameters, for a test that cares what the copy was asked. */
  const asked = (calls: Call[]) =>
    calls.find((c) => c.table === "rpc:search_catalogue_cards")?.args[0] as Record<string, unknown>;

  it("orders by the band the name reaches, then newest set: the function's job, in one call", async () => {
    const { db, calls } = fakeStore({ catalogue_cards: [row()], rpc: [hitRow()] });
    await searchMirror(db, "venusaur", 1);
    /* One call, not a select with three orders on it: the ranking and the count have to be the
       same query or the count is of another question (migration 20260918090000). */
    expect(calls.filter((c) => c.op === "rpc")).toHaveLength(1);
    expect(calls.some((c) => c.table === "catalogue_cards" && c.op === "order")).toBe(false);
  });

  it("answers null before anything has been copied", async () => {
    const { db, calls } = fakeStore();
    expect(await searchMirror(db, "charizard")).toBeNull();
    expect(calls.some((c) => c.op === "rpc")).toBe(false);
  });

  /* The copy is there when it holds cards, not when a sync record says a run happened. The
     end-to-end stack seeds catalogue_cards and no sync row, and every search in it went to
     TCGdex: with outside hosts blocked, the palette said "The card service didn't answer."
     about a catalogue in the same database. */
  it("reads the cards to know there is a copy, not the sync record", async () => {
    const { db, calls } = fakeStore({ catalogue_sync: [{ set_id: "sv03.5" }] });
    expect(await searchMirror(db, "charizard")).toBeNull();
    expect(calls.some((c) => c.table === "catalogue_sync")).toBe(false);
  });

  it("reads the copy once a card is in it, sync record or not", async () => {
    const { db } = fakeStore({ catalogue_cards: [row()], rpc: [hitRow()] });
    expect(await searchMirror(db, "charizard")).not.toBeNull();
  });

  it("asks the copy for every word, and hands a hit back in the add-card form's shape", async () => {
    const { db, calls } = fakeStore({
      catalogue_cards: [row()],
      rpc: [hitRow({ image: "https://images.cardorb.com/en/sv/sv03.5/006" })],
    });
    const found = await searchMirror(db, "Charizard 151 fire", 1);
    expect(found).toEqual({
      total: 1,
      cards: [
        {
          id: "sv03.5-006",
          number: "006",
          name: "Charizard ex",
          localName: null,
          setName: "151",
          series: "Scarlet & Violet",
          image: "https://images.cardorb.com/en/sv/sv03.5/006/low.webp",
          imageHigh: "https://images.cardorb.com/en/sv/sv03.5/006/high.webp",
          rarity: "Double Rare",
          types: ["Fire"],
          category: null,
          trainerType: null,
          tcgId: "sv03.5-006",
        },
      ],
    });
    expect(asked(calls)).toMatchObject({
      p_language: "en",
      p_words: ["charizard", "151"],
      p_type: "Fire",
      p_limit: 20,
      p_offset: 0,
    });
  });

  it("hands a word over as typed: the pattern characters are the function's to quote", async () => {
    const { db, calls } = fakeStore({ catalogue_cards: [row()] });
    await searchMirror(db, "100%");
    expect(asked(calls).p_words).toEqual(["100%"]);
  });

  it("pages twenty at a time", async () => {
    const { db, calls } = fakeStore({ catalogue_cards: [row()] });
    await searchMirror(db, "charizard", 3);
    expect(asked(calls)).toMatchObject({ p_limit: 20, p_offset: 40 });
  });

  it("remembers that the copy is there, rather than asking before every search", async () => {
    const { db, calls } = fakeStore({ catalogue_cards: [row()] });
    await searchMirror(db, "a");
    await searchMirror(db, "b");
    expect(calls.filter((c) => c.table === "catalogue_cards" && c.op === "select")).toHaveLength(1);
  });

  it("draws a hit without a scan as its name", async () => {
    const { db } = fakeStore({
      catalogue_cards: [row()],
      rpc: [hitRow({ image: null })],
    });
    const found = await searchMirror(db, "charizard");
    expect(found?.cards[0]).toMatchObject({ image: null, imageHigh: null });
  });

  it("reads the total off the rows, so one query says how many matched", async () => {
    const { db } = fakeStore({
      catalogue_cards: [row()],
      rpc: [hitRow({}, 113), hitRow({ id: "base1-4" }, 113)],
    });
    expect((await searchMirror(db, "charizard"))?.total).toBe(113);
  });

  /* Neither the count nor the card carries total_count onward: it is the query's bookkeeping,
     and a hit that carried it would put an unknown field into the add-card form's shape. */
  it("keeps the window function's count out of the hit", async () => {
    const { db } = fakeStore({ catalogue_cards: [row()], rpc: [hitRow()] });
    const found = await searchMirror(db, "charizard");
    expect(found?.cards[0]).not.toHaveProperty("total_count");
  });
});

describe("syncMirror", () => {
  const set = (id: string, total: number, releaseDate: string) => ({
    id,
    name: id.toUpperCase(),
    series: "Era",
    releaseDate,
    total,
    printedTotal: null,
    cardsRecorded: true,
    logo: null,
    symbol: null,
    localName: null,
  });
  const hit = (id: string, number: string) => ({
    id,
    number,
    name: "Card",
    localName: null,
    setName: "ignored",
    image: `https://assets.tcgdex.net/en/x/${id.split("-")[0]}/${number}/low.webp`,
    imageHigh: null,
    rarity: "Rare",
    types: ["Fire"],
    series: null,
    tcgId: id,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    setScans.mockResolvedValue({ gaps: new Set<string>(), code: null });
    tcgdexScan.mockImplementation(async (base: string) => base);
    limitlessScan.mockResolvedValue(null);
    tcgplayerScan.mockResolvedValue(null);
    scrydexScan.mockResolvedValue(null);
    ptcgScan.mockResolvedValue(null);
    canStoreImages.mockResolvedValue(false);
    keepImage.mockImplementation(async (address: string | null) => address);
    tcgdexFolderMissing.mockResolvedValue(false);
    productFactsOf.mockResolvedValue(new Map());
    englishSet.mockImplementation(async (id: string) => ({
      set: set(id, 1, "2024/01/01"),
      cards: [hit(`${id}-001`, "001")],
    }));
  });

  it("copies a set the copy has never seen first, then one whose count moved, then the oldest", async () => {
    englishSets.mockResolvedValue([
      set("new", 10, "2026/01/01"),
      set("grown", 12, "2025/01/01"),
      set("stale", 10, "2024/01/01"),
      set("fresh", 10, "2023/01/01"),
    ]);
    const { db } = fakeStore({
      catalogue_sync: [
        { set_id: "grown", cards: 10, synced_at: "2026-09-10T00:00:00Z", format: CATALOGUE_FORMAT },
        { set_id: "stale", cards: 10, synced_at: "2026-09-01T00:00:00Z", format: CATALOGUE_FORMAT },
        { set_id: "fresh", cards: 10, synced_at: "2026-09-11T00:00:00Z", format: CATALOGUE_FORMAT },
      ],
    });
    const report = await syncMirror(db, { parallel: 1 });
    expect(report.copied).toEqual(["new", "grown", "stale", "fresh"]);
    expect(report.left).toBe(0);
  });

  it("copies a set held in an older shape ahead of the oldest, and writes it in the new one", async () => {
    englishSets.mockResolvedValue([set("stale", 1, "2024/01/01"), set("behind", 1, "2023/01/01")]);
    englishSet.mockImplementation(async (id: string) => ({
      set: { ...set(id, 1, "2024/01/01"), serieId: "base" },
      cards: [
        {
          ...hit(`${id}-001`, "001"),
          sheet: {
            illustrator: "Ken Sugimori",
            hp: 100,
            stage: "Stage2",
            evolveFrom: "Machoke",
            regulationMark: null,
            firstEdition: true,
            variants: [{ type: "holo" }],
          },
        },
      ],
    }));
    const { db, calls } = fakeStore({
      catalogue_sync: [
        { set_id: "stale", cards: 1, synced_at: "2026-09-01T00:00:00Z", format: CATALOGUE_FORMAT },
        {
          set_id: "behind",
          cards: 1,
          synced_at: "2026-09-12T00:00:00Z",
          format: CATALOGUE_FORMAT - 1,
        },
      ],
    });
    const report = await syncMirror(db, { parallel: 1 });
    expect(report.copied).toEqual(["behind", "stale"]);
    expect(calls.find((c) => c.table === "catalogue_cards" && c.op === "upsert")?.args[0]).toEqual([
      expect.objectContaining({
        id: "behind-001",
        illustrator: "Ken Sugimori",
        hp: 100,
        evolve_from: "Machoke",
        first_edition: true,
        variants: [{ type: "holo" }],
        languages: ["en"],
      }),
    ]);
    expect(calls.find((c) => c.table === "catalogue_sets" && c.op === "upsert")?.args[0]).toEqual(
      expect.objectContaining({ id: "behind", serie_id: "base" }),
    );
    expect(calls.find((c) => c.table === "catalogue_sync" && c.op === "upsert")?.args[0]).toEqual(
      expect.objectContaining({ set_id: "behind", format: CATALOGUE_FORMAT }),
    );
  });

  /* Mew-EX (bw11-RC24) was copied with no stage on 2026-09-14, and Jolteon V (swsh7-177) as no
     full art: TCGplayer's product says both. */
  it("fills a stage TCGdex leaves empty from TCGplayer's product, and takes its full art", async () => {
    englishSets.mockResolvedValue([set("bw11", 3, "2013/11/08")]);
    const sheet = (stage: string | null) => ({
      illustrator: null,
      hp: 120,
      stage,
      evolveFrom: null,
      regulationMark: null,
      firstEdition: null,
      variants: [],
    });
    englishSet.mockResolvedValue({
      set: set("bw11", 3, "2013/11/08"),
      cards: [
        { ...hit("bw11-RC24", "RC24"), name: "Mew-EX", category: "Pokemon", sheet: sheet(null) },
        { ...hit("bw11-29", "29"), name: "Reshiram", category: "Pokemon", sheet: sheet("Basic") },
        { ...hit("bw11-100", "100"), name: "Potion", category: "Trainer", sheet: sheet(null) },
      ],
    });
    productFactsOf.mockResolvedValue(
      new Map([
        ["bw11-RC24", { name: "Mew EX (Full Art)", stage: "Basic" }],
        ["bw11-29", { name: "Reshiram", stage: "Stage1" }],
        ["bw11-100", { name: "Potion", stage: "Basic" }],
      ]),
    );
    const { db, calls } = fakeStore();
    await syncMirror(db);
    expect(productFactsOf).toHaveBeenCalledWith(["bw11-RC24", "bw11-29", "bw11-100"]);
    expect(calls.find((c) => c.table === "catalogue_cards" && c.op === "upsert")?.args[0]).toEqual([
      expect.objectContaining({ id: "bw11-RC24", stage: "Basic", full_art: true }),
      expect.objectContaining({ id: "bw11-29", stage: "Basic", full_art: false }),
      expect.objectContaining({ id: "bw11-100", stage: null, full_art: false }),
    ]);
  });

  /* 30th Classic Collection was copied with no rarity on 2026-09-17, where TCGplayer names one, and
     the old sets' holos as a plain Rare until card-fact-corrections.ts wrote TCGplayer's grade by
     hand: the rule (tcgplayerRarity) does it for every card, a new set's too. */
  it("takes TCGplayer's rarity where TCGdex names none, or a plain Rare of a holo", async () => {
    englishSets.mockResolvedValue([set("30th-c", 3, "2026/02/27")]);
    englishSet.mockResolvedValue({
      set: set("30th-c", 3, "2026/02/27"),
      cards: [
        { ...hit("30th-c-001", "001"), name: "Charizard", rarity: null },
        { ...hit("30th-c-002", "002"), name: "Venusaur", rarity: "Rare" },
        { ...hit("30th-c-003", "003"), name: "Pikachu", rarity: "Rare" },
      ],
    });
    productFactsOf.mockResolvedValue(
      new Map([
        ["30th-c-001", { name: "Charizard", stage: null, rarity: "Classic Collection" }],
        ["30th-c-002", { name: "Venusaur", stage: null, rarity: "Holo Rare" }],
        ["30th-c-003", { name: "Pikachu", stage: null, rarity: "Prism Rare" }],
      ]),
    );
    const { db, calls } = fakeStore();
    await syncMirror(db);
    expect(calls.find((c) => c.table === "catalogue_cards" && c.op === "upsert")?.args[0]).toEqual([
      expect.objectContaining({ id: "30th-c-001", rarity: "Classic Collection" }),
      expect.objectContaining({ id: "30th-c-002", rarity: "Holo Rare" }),
      expect.objectContaining({ id: "30th-c-003", rarity: "Rare" }),
    ]);
  });

  it("leaves a set for the next run where TCGplayer's products will not answer", async () => {
    englishSets.mockResolvedValue([set("bw11", 1, "2013/11/08")]);
    productFactsOf.mockRejectedValue(new Error("tcgcsv 503"));
    const { db, calls } = fakeStore();
    const report = await syncMirror(db);
    expect(report.failed).toEqual(["bw11"]);
    expect(calls.find((c) => c.table === "catalogue_cards" && c.op === "upsert")).toBeUndefined();
  });

  it("stops at the budget and says how many it left, keeping what it wrote", async () => {
    englishSets.mockResolvedValue([
      set("a", 1, "2026/01/01"),
      set("b", 1, "2025/01/01"),
      set("c", 1, "2024/01/01"),
    ]);
    const { db, calls } = fakeStore();
    let tick = 0;
    const report = await syncMirror(db, { parallel: 1, budgetMs: 25, now: () => (tick += 10) });
    expect(report.copied).toEqual(["a", "b"]);
    expect(report.left).toBe(1);
    expect(calls.filter((c) => c.table === "catalogue_sync" && c.op === "upsert")).toHaveLength(2);
  });

  it("writes a card as the copy holds it, with the scan's stem", async () => {
    englishSets.mockResolvedValue([set("sv03.5", 1, "2023/09/22")]);
    englishSet.mockResolvedValue({
      set: { ...set("sv03.5", 1, "2023/09/22"), name: "151", series: "Scarlet & Violet" },
      cards: [hit("sv03.5-006", "006")],
    });
    const { db, calls } = fakeStore();
    await syncMirror(db);
    expect(englishSet).toHaveBeenCalledWith("sv03.5", { factsRequired: true });
    const written = calls.find((c) => c.table === "catalogue_cards" && c.op === "upsert");
    expect(written?.args[0]).toEqual([
      expect.objectContaining({
        id: "sv03.5-006",
        set_id: "sv03.5",
        local_id: "006",
        name: "Card",
        set_name: "151",
        series: "Scarlet & Violet",
        release_date: "2023/09/22",
        rarity: "Rare",
        types: ["Fire"],
        image: "https://assets.tcgdex.net/en/x/sv03.5/006",
      }),
    ]);
    // The set's rows this write did not touch are dropped, and the set is stamped as copied.
    expect(calls.find((c) => c.table === "catalogue_cards" && c.op === "delete")).toBeDefined();
    expect(
      calls.find((c) => c.table === "catalogue_sync" && c.op === "upsert")?.args[0],
    ).toMatchObject({
      set_id: "sv03.5",
      cards: 1,
    });
  });

  /* The gap this closes: TCGdex names no scan for a handful of cards a set, its built address
     is a 404 for some of those, and the copy used to keep the 404. */
  it("keeps the built address for a card TCGdex names no scan for but does have a file for", async () => {
    englishSets.mockResolvedValue([set("svp", 1, "2023/06/30")]);
    englishSet.mockResolvedValue({
      set: set("svp", 1, "2023/06/30"),
      cards: [hit("svp-102", "102")],
    });
    setScans.mockResolvedValue({ gaps: new Set(["102"]), code: "SVP" });
    const { db, calls } = fakeStore();
    await syncMirror(db);
    expect(calls.find((c) => c.table === "catalogue_cards" && c.op === "upsert")?.args[0]).toEqual([
      expect.objectContaining({ image: "https://assets.tcgdex.net/en/x/svp/102" }),
    ]);
    expect(ptcgScan).not.toHaveBeenCalled();
  });

  it("copies the second catalogue's file where the built address holds nothing", async () => {
    englishSets.mockResolvedValue([set("svp", 1, "2023/06/30")]);
    englishSet.mockResolvedValue({
      set: { ...set("svp", 1, "2023/06/30"), name: "SVP Black Star Promos" },
      cards: [{ ...hit("svp-085", "085"), name: "Pikachu with Grey Felt Hat" }],
    });
    setScans.mockResolvedValue({ gaps: new Set(["085"]), code: "SVP" });
    tcgdexScan.mockResolvedValue(null);
    ptcgScan.mockResolvedValue("https://images.pokemontcg.io/svp/85.png");
    const { db, calls } = fakeStore();
    await syncMirror(db);
    expect(ptcgScan).toHaveBeenCalledWith(
      "SVP Black Star Promos",
      "085",
      "Pikachu with Grey Felt Hat",
    );
    expect(calls.find((c) => c.table === "catalogue_cards" && c.op === "upsert")?.args[0]).toEqual([
      expect.objectContaining({ image: "https://images.pokemontcg.io/svp/85.png" }),
    ]);
  });

  /* 30th Celebration and its Classic Collection both print 30C, and Limitless's 30C folder is the
     parent's run: 30C_001 is Exeggcute, which the copy took as the Classic Collection's Charizard
     (2026-09-17). Both sets came out the same day, so neither was in the copy when it guessed. */
  it("never guesses Limitless for a set whose printed code another English set carries", async () => {
    englishSets.mockResolvedValue([set("30th", 1, "2026/09/16"), set("30th-c", 1, "2026/09/16")]);
    englishSet.mockImplementation(async (id: string) => ({
      set: set(id, 1, "2026/09/16"),
      cards: [hit(`${id}-001`, "001")],
    }));
    setScans.mockImplementation(async (id: string) => ({
      gaps: new Set(id === "30th-c" ? ["001"] : []),
      code: "30C",
    }));
    tcgdexScan.mockResolvedValue(null);
    limitlessScan.mockResolvedValue("/api/cover?url=https%3A%2F%2Flimitless%2F30C_001.png");
    tcgplayerScan.mockResolvedValue(
      "https://tcgplayer-cdn.tcgplayer.com/product/714372_in_1000x1000.jpg",
    );
    const { db, calls } = fakeStore();
    await syncMirror(db);
    expect(limitlessScan).not.toHaveBeenCalled();
    const written = calls
      .filter((c) => c.table === "catalogue_cards" && c.op === "upsert")
      .flatMap((c) => c.args[0] as { id: string; image: string | null }[]);
    expect(written.find((c) => c.id === "30th-c-001")?.image).toBe(
      "https://tcgplayer-cdn.tcgplayer.com/product/714372_in_1000x1000.jpg",
    );
  });

  it("knows a shared code from the copy's own set rows, without asking TCGdex again", async () => {
    englishSets.mockResolvedValue([set("cel25cc", 1, "2021/10/08")]);
    englishSet.mockResolvedValue({
      set: set("cel25cc", 1, "2021/10/08"),
      cards: [hit("cel25cc-2", "2")],
    });
    setScans.mockResolvedValue({ gaps: new Set(["2"]), code: "CEL" });
    tcgdexScan.mockResolvedValue(null);
    limitlessScan.mockResolvedValue("/api/cover?url=https%3A%2F%2Flimitless%2FCEL_002.png");
    const { db } = fakeStore({
      catalogue_sets: [
        { id: "cel25", abbreviation: "CEL" },
        { id: "cel25cc", abbreviation: "CEL" },
      ],
    });
    await syncMirror(db);
    expect(limitlessScan).not.toHaveBeenCalled();
  });

  it("makes no Limitless guess at all where a set new to the copy cannot say its code", async () => {
    englishSets.mockResolvedValue([set("new", 1, "2026/09/16"), set("svp", 1, "2023/06/30")]);
    englishSet.mockImplementation(async (id: string) => ({
      set: set(id, 1, "2023/06/30"),
      cards: [hit(`${id}-102`, "102")],
    }));
    setScans.mockImplementation(async (id: string) => {
      if (id === "new") throw new Error("TCGdex is down");
      return { gaps: new Set(["102"]), code: "SVP" };
    });
    tcgdexScan.mockResolvedValue(null);
    limitlessScan.mockResolvedValue("/api/cover?url=https%3A%2F%2Flimitless%2FSVP_102.png");
    const { db } = fakeStore();
    await syncMirror(db);
    expect(limitlessScan).not.toHaveBeenCalled();
  });

  it("asks Limitless before pokemontcg.io, under the set's printed code", async () => {
    englishSets.mockResolvedValue([set("svp", 1, "2023/06/30")]);
    englishSet.mockResolvedValue({
      set: set("svp", 1, "2023/06/30"),
      cards: [{ ...hit("svp-102", "102"), name: "Oddish" }],
    });
    setScans.mockResolvedValue({ gaps: new Set(["102"]), code: "SVP" });
    tcgdexScan.mockResolvedValue(null);
    limitlessScan.mockResolvedValue("/api/cover?url=https%3A%2F%2Flimitless%2FSVP_102.png");
    const { db, calls } = fakeStore();
    await syncMirror(db);
    expect(limitlessScan).toHaveBeenCalledWith("SVP", "102");
    expect(ptcgScan).not.toHaveBeenCalled();
    expect(calls.find((c) => c.table === "catalogue_cards" && c.op === "upsert")?.args[0]).toEqual([
      expect.objectContaining({ image: "/api/cover?url=https%3A%2F%2Flimitless%2FSVP_102.png" }),
    ]);
  });

  /* Limitless renumbers a gallery's cards into the parent's run, so a lettered number would
     answer with a confidently wrong card; pokemontcg.io publishes those as sets of their own. */
  it("asks TCGplayer by the card's product before pokemontcg.io by set name", async () => {
    englishSets.mockResolvedValue([set("2014xy", 1, "2014/11/01")]);
    englishSet.mockResolvedValue({
      set: set("2014xy", 1, "2014/11/01"),
      cards: [hit("2014xy-1", "1")],
    });
    setScans.mockResolvedValue({ gaps: new Set(["1"]), code: null });
    tcgdexScan.mockResolvedValue(null);
    tcgplayerScan.mockResolvedValue(
      "https://tcgplayer-cdn.tcgplayer.com/product/110406_in_1000x1000.jpg",
    );
    const { db, calls } = fakeStore();
    await syncMirror(db);
    expect(tcgplayerScan).toHaveBeenCalledWith("2014xy-1");
    expect(ptcgScan).not.toHaveBeenCalled();
    expect(calls.find((c) => c.table === "catalogue_cards" && c.op === "upsert")?.args[0]).toEqual([
      expect.objectContaining({
        image: "https://tcgplayer-cdn.tcgplayer.com/product/110406_in_1000x1000.jpg",
      }),
    ]);
  });

  it("copies a set's pictures into our bucket and keeps our address", async () => {
    englishSets.mockResolvedValue([set("swsh11", 1, "2022/09/09")]);
    englishSet.mockResolvedValue({
      set: set("swsh11", 1, "2022/09/09"),
      cards: [hit("swsh11-186", "186")],
    });
    canStoreImages.mockResolvedValue(true);
    keepImage.mockResolvedValue("https://images.cardorb.com/en/x/swsh11/186");
    const { db, calls } = fakeStore();
    await syncMirror(db);
    expect(keepImage).toHaveBeenCalledWith("https://assets.tcgdex.net/en/x/swsh11/186");
    expect(calls.find((c) => c.table === "catalogue_cards" && c.op === "upsert")?.args[0]).toEqual([
      expect.objectContaining({ image: "https://images.cardorb.com/en/x/swsh11/186" }),
    ]);
  });

  it("asks nothing for a picture the copy already holds in our bucket", async () => {
    englishSets.mockResolvedValue([set("swsh11", 1, "2022/09/09")]);
    englishSet.mockResolvedValue({
      set: set("swsh11", 1, "2022/09/09"),
      cards: [hit("swsh11-186", "186")],
    });
    canStoreImages.mockResolvedValue(true);
    const { db, calls } = fakeStore({
      catalogue_sync: [
        { set_id: "swsh11", cards: 1, synced_at: "2026-09-12T00:00:00Z", format: 1 },
      ],
      catalogue_cards: [
        row({ id: "swsh11-186", image: "https://images.cardorb.com/en/x/swsh11/186" }),
      ],
    });
    await syncMirror(db);
    expect(keepImage).not.toHaveBeenCalled();
    expect(calls.find((c) => c.table === "catalogue_cards" && c.op === "upsert")?.args[0]).toEqual([
      expect.objectContaining({ image: "https://images.cardorb.com/en/x/swsh11/186" }),
    ]);
  });

  /* Bart, 2026-09-15: a picture in our bucket stands. The night the bucket check timed out, every
     card would have gone back to TCGdex's address, and a logo to nothing. */
  it("keeps every picture, logo and symbol held in our bucket where the bucket check fails", async () => {
    englishSets.mockResolvedValue([set("swsh11", 1, "2022/09/09")]);
    englishSet.mockResolvedValue({
      set: { ...set("swsh11", 1, "2022/09/09"), logo: null, symbol: null },
      cards: [hit("swsh11-186", "186")],
    });
    canStoreImages.mockResolvedValue(false);
    const { db, calls } = fakeStore({
      catalogue_sync: [
        { set_id: "swsh11", cards: 1, synced_at: "2026-09-12T00:00:00Z", format: 1 },
      ],
      catalogue_sets: [
        {
          id: "swsh11",
          logo: "https://images.cardorb.com/en/swsh/swsh11/logo.webp",
          symbol: "https://images.cardorb.com/en/swsh/swsh11/symbol.webp",
        },
      ],
      catalogue_cards: [
        row({ id: "swsh11-186", image: "https://images.cardorb.com/en/x/swsh11/186" }),
      ],
    });
    await syncMirror(db);
    expect(calls.find((c) => c.table === "catalogue_cards" && c.op === "upsert")?.args[0]).toEqual([
      expect.objectContaining({ image: "https://images.cardorb.com/en/x/swsh11/186" }),
    ]);
    expect(
      calls.find((c) => c.table === "catalogue_sets" && c.op === "upsert")?.args[0],
    ).toMatchObject({
      logo: "https://images.cardorb.com/en/swsh/swsh11/logo.webp",
      symbol: "https://images.cardorb.com/en/swsh/swsh11/symbol.webp",
    });
  });

  it("asks Scrydex by the set's name for a set with no logo, and writes what it finds", async () => {
    englishSets.mockResolvedValue([set("30th", 1, "2026/09/16")]);
    englishSet.mockResolvedValue({
      set: { ...set("30th", 1, "2026/09/16"), name: "30th Celebration" },
      cards: [hit("30th-001", "001")],
    });
    scrydexEnglishLogo.mockResolvedValueOnce("https://images.scrydex.com/pokemon/me55-logo/logo");
    const { db, calls } = fakeStore({});
    await syncMirror(db);
    expect(scrydexEnglishLogo).toHaveBeenCalledWith("30th", "30th Celebration");
    expect(
      calls.find((c) => c.table === "catalogue_sets" && c.op === "upsert")?.args[0],
    ).toMatchObject({ logo: "https://images.scrydex.com/pokemon/me55-logo/logo" });
  });

  it("keeps the logo a set holds where the lookup finds nothing", async () => {
    englishSets.mockResolvedValue([set("me09", 1, "2026/11/01")]);
    englishSet.mockResolvedValue({
      set: { ...set("me09", 1, "2026/11/01"), name: "Brand New Set" },
      cards: [hit("me09-001", "001")],
    });
    scrydexEnglishLogo.mockResolvedValueOnce(null);
    const { db, calls } = fakeStore({
      catalogue_sync: [{ set_id: "me09", cards: 1, synced_at: "2026-11-02T00:00:00Z", format: 1 }],
      catalogue_sets: [{ id: "me09", logo: "https://images.scrydex.com/pokemon/me9-logo/logo" }],
    });
    await syncMirror(db);
    expect(
      calls.find((c) => c.table === "catalogue_sets" && c.op === "upsert")?.args[0],
    ).toMatchObject({ logo: "https://images.scrydex.com/pokemon/me9-logo/logo" });
  });

  it("asks nobody for a card held as our copy of another source's picture, in a full pass too", async () => {
    englishSets.mockResolvedValue([set("dc1", 1, "2016/02/22")]);
    englishSet.mockResolvedValue({ set: set("dc1", 1, "2016/02/22"), cards: [hit("dc1-1", "1")] });
    setScans.mockResolvedValue({ gaps: new Set(["1"]), code: null });
    canStoreImages.mockResolvedValue(true);
    tcgdexFolderMissing.mockResolvedValue(true);
    const held = "https://images.cardorb.com/tcgplayer/112233.jpg";
    const { db, calls } = fakeStore({
      catalogue_sync: [{ set_id: "dc1", cards: 1, synced_at: "2026-09-12T00:00:00Z", format: 1 }],
      catalogue_cards: [row({ id: "dc1-1", image: held })],
    });
    await syncMirror(db, { full: true });
    expect(tcgdexScan).not.toHaveBeenCalled();
    expect(tcgplayerScan).not.toHaveBeenCalled();
    expect(keepImage).not.toHaveBeenCalled();
    expect(calls.find((c) => c.table === "catalogue_cards" && c.op === "upsert")?.args[0]).toEqual([
      expect.objectContaining({ image: held }),
    ]);
  });

  it("leaves a set as it was where the copy cannot say what it holds", async () => {
    englishSets.mockResolvedValue([set("swsh11", 1, "2022/09/09")]);
    const { db, calls } = fakeStore();
    const from = db.from.bind(db);
    (db as { from: (t: string) => unknown }).from = (table: string) => {
      const chain = from(table) as unknown as Record<string, unknown>;
      if (table === "catalogue_cards")
        chain.then = (resolve: (v: unknown) => unknown) =>
          resolve({ data: null, error: { message: "timeout" }, count: 0 });
      return chain;
    };
    const report = await syncMirror(db);
    expect(report.failed).toEqual(["swsh11"]);
    expect(calls.some((c) => c.table === "catalogue_cards" && c.op === "upsert")).toBe(false);
  });

  it("counts the pictures a run changes, and none where the copy already holds them", async () => {
    englishSets.mockResolvedValue([set("swsh11", 1, "2022/09/09")]);
    englishSet.mockResolvedValue({
      set: set("swsh11", 1, "2022/09/09"),
      cards: [hit("swsh11-186", "186")],
    });
    const fresh = fakeStore();
    expect((await syncMirror(fresh.db)).pictures).toBe(1);
    const same = fakeStore({
      catalogue_sync: [
        { set_id: "swsh11", cards: 1, synced_at: "2026-09-12T00:00:00Z", format: 1 },
      ],
      catalogue_cards: [
        row({ id: "swsh11-186", image: "https://assets.tcgdex.net/en/x/swsh11/186" }),
      ],
    });
    expect((await syncMirror(same.db)).pictures).toBe(0);
    canStoreImages.mockResolvedValue(true);
    keepImage.mockResolvedValue("https://images.cardorb.com/en/x/swsh11/186");
    const moved = fakeStore({
      catalogue_sync: [
        { set_id: "swsh11", cards: 1, synced_at: "2026-09-12T00:00:00Z", format: 1 },
      ],
      catalogue_cards: [
        row({ id: "swsh11-186", image: "https://assets.tcgdex.net/en/x/swsh11/186" }),
      ],
    });
    expect((await syncMirror(moved.db)).pictures).toBe(1);
  });

  it("takes TCGplayer's picture where TCGdex names a scan it has no file for (dc1-1)", async () => {
    englishSets.mockResolvedValue([set("dc1", 1, "2015/03/25")]);
    englishSet.mockResolvedValue({ set: set("dc1", 1, "2015/03/25"), cards: [hit("dc1-1", "1")] });
    canStoreImages.mockResolvedValue(true);
    tcgdexFolderMissing.mockResolvedValue(true);
    tcgplayerScan.mockResolvedValue(
      "https://tcgplayer-cdn.tcgplayer.com/product/97047_in_1000x1000.jpg",
    );
    keepImage.mockImplementation(async (address: string | null) =>
      address?.startsWith("https://tcgplayer-cdn")
        ? "https://images.cardorb.com/tcgplayer/97047.jpg"
        : address,
    );
    const { db, calls } = fakeStore();
    await syncMirror(db);
    expect(tcgplayerScan).toHaveBeenCalledWith("dc1-1");
    expect(calls.find((c) => c.table === "catalogue_cards" && c.op === "upsert")?.args[0]).toEqual([
      expect.objectContaining({ image: "https://images.cardorb.com/tcgplayer/97047.jpg" }),
    ]);
  });

  it("keeps TCGdex's address when its copy fails for another reason than a missing file", async () => {
    englishSets.mockResolvedValue([set("dc1", 1, "2015/03/25")]);
    englishSet.mockResolvedValue({ set: set("dc1", 1, "2015/03/25"), cards: [hit("dc1-1", "1")] });
    canStoreImages.mockResolvedValue(true);
    const { db, calls } = fakeStore();
    await syncMirror(db);
    expect(tcgplayerScan).not.toHaveBeenCalled();
    expect(calls.find((c) => c.table === "catalogue_cards" && c.op === "upsert")?.args[0]).toEqual([
      expect.objectContaining({ image: "https://assets.tcgdex.net/en/x/dc1/1" }),
    ]);
  });

  it("asks Scrydex last, where no other catalogue has the card", async () => {
    englishSets.mockResolvedValue([set("tk-xy-b", 1, "2014/03/01")]);
    englishSet.mockResolvedValue({
      set: set("tk-xy-b", 1, "2014/03/01"),
      cards: [hit("tk-xy-b-16", "16")],
    });
    setScans.mockResolvedValue({ gaps: new Set(["16"]), code: null });
    tcgdexScan.mockResolvedValue(null);
    scrydexScan.mockResolvedValue("https://images.scrydex.com/pokemon/tk7b-16/large");
    const { db, calls } = fakeStore();
    await syncMirror(db);
    expect(ptcgScan).toHaveBeenCalled();
    expect(scrydexScan).toHaveBeenCalledWith("tk-xy-b", "16");
    expect(calls.find((c) => c.table === "catalogue_cards" && c.op === "upsert")?.args[0]).toEqual([
      expect.objectContaining({ image: "https://images.scrydex.com/pokemon/tk7b-16/large" }),
    ]);
  });

  it("never guesses at Limitless for a gallery number", async () => {
    englishSets.mockResolvedValue([set("swsh12tg", 1, "2022/09/09")]);
    englishSet.mockResolvedValue({
      set: set("swsh12tg", 1, "2022/09/09"),
      cards: [hit("swsh12tg-TG04", "TG04")],
    });
    setScans.mockResolvedValue({ gaps: new Set(["TG04"]), code: "SIT" });
    tcgdexScan.mockResolvedValue(null);
    const { db } = fakeStore();
    await syncMirror(db);
    expect(limitlessScan).not.toHaveBeenCalled();
    expect(ptcgScan).toHaveBeenCalled();
  });

  /* A nightly refresh of a set nothing has happened to: 46 seconds against 11 for a pass that
     asks it all again (measured 2026-09-12). */
  it("keeps the picture the copy already worked out, without asking anyone", async () => {
    englishSets.mockResolvedValue([set("svp", 1, "2023/06/30")]);
    englishSet.mockResolvedValue({
      set: set("svp", 1, "2023/06/30"),
      cards: [hit("svp-085", "085")],
    });
    setScans.mockResolvedValue({ gaps: new Set(["085"]), code: "SVP" });
    const { db, calls } = fakeStore({
      catalogue_sync: [{ set_id: "svp", cards: 1, synced_at: "2026-09-12T00:00:00Z", format: 1 }],
      catalogue_cards: [row({ id: "svp-085", image: "https://images.pokemontcg.io/svp/85.png" })],
    });
    await syncMirror(db);
    expect(tcgdexScan).not.toHaveBeenCalled();
    expect(limitlessScan).not.toHaveBeenCalled();
    expect(ptcgScan).not.toHaveBeenCalled();
    expect(calls.find((c) => c.table === "catalogue_cards" && c.op === "upsert")?.args[0]).toEqual([
      expect.objectContaining({ image: "https://images.pokemontcg.io/svp/85.png" }),
    ]);
  });

  it("probes a card the copy has no picture for, but does not ask the other two again", async () => {
    englishSets.mockResolvedValue([set("svp", 1, "2023/06/30")]);
    englishSet.mockResolvedValue({
      set: set("svp", 1, "2023/06/30"),
      cards: [hit("svp-190", "190")],
    });
    setScans.mockResolvedValue({ gaps: new Set(["190"]), code: "SVP" });
    tcgdexScan.mockResolvedValue(null);
    const { db, calls } = fakeStore({
      catalogue_sync: [{ set_id: "svp", cards: 1, synced_at: "2026-09-12T00:00:00Z", format: 1 }],
      catalogue_cards: [row({ id: "svp-190", image: null })],
    });
    await syncMirror(db);
    expect(tcgdexScan).toHaveBeenCalledTimes(1);
    expect(limitlessScan).not.toHaveBeenCalled();
    expect(ptcgScan).not.toHaveBeenCalled();
    expect(calls.find((c) => c.table === "catalogue_cards" && c.op === "upsert")?.args[0]).toEqual([
      expect.objectContaining({ image: null }),
    ]);
  });

  it("asks every gap of a set the second catalogue answers, past the fortieth (Crown Zenith GG69)", async () => {
    const numbers = Array.from({ length: 70 }, (_, i) => `GG${String(i + 1).padStart(2, "0")}`);
    englishSets.mockResolvedValue([set("swsh12.5gg", 70, "2023/01/20")]);
    englishSet.mockResolvedValue({
      set: set("swsh12.5gg", 70, "2023/01/20"),
      cards: numbers.map((n) => hit(`swsh12.5gg-${n}`, n)),
    });
    setScans.mockResolvedValue({ gaps: new Set(numbers), code: "CRZ" });
    tcgdexScan.mockResolvedValue(null);
    ptcgScan.mockImplementation(
      (async (_set: string, n: string) =>
        `https://images.pokemontcg.io/swsh12pt5gg/${n}.png`) as never,
    );
    const { db, calls } = fakeStore();
    await syncMirror(db);
    const written = calls.find((c) => c.table === "catalogue_cards" && c.op === "upsert")
      ?.args[0] as { id: string; image: string | null }[];
    expect(written.filter((c) => c.image === null)).toEqual([]);
    expect(written.find((c) => c.id === "swsh12.5gg-GG69")?.image).toBe(
      "https://images.pokemontcg.io/swsh12pt5gg/GG69.png",
    );
  });

  it("gives up on a set neither catalogue has after ten lookups", async () => {
    const numbers = Array.from({ length: 30 }, (_, i) => String(i + 1).padStart(3, "0"));
    englishSets.mockResolvedValue([set("tk-xy-b", 30, "2014/01/01")]);
    englishSet.mockResolvedValue({
      set: set("tk-xy-b", 30, "2014/01/01"),
      cards: numbers.map((n) => hit(`tk-xy-b-${n}`, n)),
    });
    setScans.mockResolvedValue({ gaps: new Set(numbers), code: null });
    tcgdexScan.mockResolvedValue(null);
    const { db } = fakeStore();
    await syncMirror(db);
    // Eight at a time: the tenth miss can have up to seven more lookups already under way.
    expect(ptcgScan.mock.calls.length).toBeGreaterThanOrEqual(10);
    expect(ptcgScan.mock.calls.length).toBeLessThan(18);
  });

  it("asks again about a blank card of a set the second catalogue has other files for", async () => {
    englishSets.mockResolvedValue([set("swsh12.5gg", 2, "2023/01/20")]);
    englishSet.mockResolvedValue({
      set: set("swsh12.5gg", 2, "2023/01/20"),
      cards: [hit("swsh12.5gg-GG40", "GG40"), hit("swsh12.5gg-GG69", "GG69")],
    });
    setScans.mockResolvedValue({ gaps: new Set(["GG40", "GG69"]), code: "CRZ" });
    tcgdexScan.mockResolvedValue(null);
    ptcgScan.mockResolvedValue("https://images.pokemontcg.io/swsh12pt5gg/GG69.png");
    const { db, calls } = fakeStore({
      catalogue_sync: [
        { set_id: "swsh12.5gg", cards: 2, synced_at: "2026-09-12T00:00:00Z", format: 1 },
      ],
      catalogue_cards: [
        row({ id: "swsh12.5gg-GG40", image: "https://images.pokemontcg.io/swsh12pt5gg/GG40.png" }),
        row({ id: "swsh12.5gg-GG69", image: null }),
      ],
    });
    await syncMirror(db);
    expect(ptcgScan).toHaveBeenCalledTimes(1);
    expect(calls.find((c) => c.table === "catalogue_cards" && c.op === "upsert")?.args[0]).toEqual([
      expect.objectContaining({ id: "swsh12.5gg-GG40" }),
      expect.objectContaining({
        id: "swsh12.5gg-GG69",
        image: "https://images.pokemontcg.io/swsh12pt5gg/GG69.png",
      }),
    ]);
  });

  it("takes the scan TCGdex has published since, on a card the copy had none for", async () => {
    englishSets.mockResolvedValue([set("svp", 1, "2023/06/30")]);
    englishSet.mockResolvedValue({
      set: set("svp", 1, "2023/06/30"),
      cards: [hit("svp-190", "190")],
    });
    setScans.mockResolvedValue({ gaps: new Set(["190"]), code: "SVP" });
    const { db, calls } = fakeStore({
      catalogue_sync: [{ set_id: "svp", cards: 1, synced_at: "2026-09-12T00:00:00Z", format: 1 }],
      catalogue_cards: [row({ id: "svp-190", image: null })],
    });
    await syncMirror(db);
    expect(calls.find((c) => c.table === "catalogue_cards" && c.op === "upsert")?.args[0]).toEqual([
      expect.objectContaining({ image: "https://assets.tcgdex.net/en/x/svp/190" }),
    ]);
  });

  it("works a set out in full where its card count has moved", async () => {
    englishSets.mockResolvedValue([set("svp", 2, "2023/06/30")]);
    englishSet.mockResolvedValue({
      set: set("svp", 2, "2023/06/30"),
      cards: [hit("svp-085", "085")],
    });
    setScans.mockResolvedValue({ gaps: new Set(["085"]), code: "SVP" });
    tcgdexScan.mockResolvedValue(null);
    ptcgScan.mockResolvedValue("https://images.pokemontcg.io/svp/85.png");
    const { db } = fakeStore({
      catalogue_sync: [{ set_id: "svp", cards: 1, synced_at: "2026-09-12T00:00:00Z", format: 1 }],
      catalogue_cards: [row({ id: "svp-085", image: null })],
    });
    await syncMirror(db);
    expect(ptcgScan).toHaveBeenCalled();
  });

  /* The day a source is added to the chain: a card copied without a picture was told "no" by
     the sources of that day, and nothing would ever ask the new one about it. */
  it("works every set out from scratch when asked for a full pass", async () => {
    englishSets.mockResolvedValue([set("svp", 1, "2023/06/30")]);
    englishSet.mockResolvedValue({
      set: set("svp", 1, "2023/06/30"),
      cards: [hit("svp-102", "102")],
    });
    setScans.mockResolvedValue({ gaps: new Set(["102"]), code: "SVP" });
    tcgdexScan.mockResolvedValue(null);
    limitlessScan.mockResolvedValue("/api/cover?url=limitless");
    const { db, calls } = fakeStore({
      catalogue_sync: [{ set_id: "svp", cards: 1, synced_at: "2026-09-12T00:00:00Z", format: 1 }],
      catalogue_cards: [row({ id: "svp-102", image: null })],
    });
    await syncMirror(db, { full: true });
    expect(limitlessScan).toHaveBeenCalled();
    expect(calls.find((c) => c.table === "catalogue_cards" && c.op === "upsert")?.args[0]).toEqual([
      expect.objectContaining({ image: "/api/cover?url=limitless" }),
    ]);
  });

  it("copies no picture at all where neither catalogue has one", async () => {
    englishSets.mockResolvedValue([set("svp", 1, "2023/06/30")]);
    englishSet.mockResolvedValue({
      set: set("svp", 1, "2023/06/30"),
      cards: [hit("svp-190", "190")],
    });
    setScans.mockResolvedValue({ gaps: new Set(["190"]), code: "SVP" });
    tcgdexScan.mockResolvedValue(null);
    ptcgScan.mockResolvedValue(null);
    const { db, calls } = fakeStore();
    await syncMirror(db);
    expect(calls.find((c) => c.table === "catalogue_cards" && c.op === "upsert")?.args[0]).toEqual([
      expect.objectContaining({ image: null }),
    ]);
  });

  it("leaves every address alone where the catalogue names a scan for all of them", async () => {
    englishSets.mockResolvedValue([set("sv03.5", 1, "2023/09/22")]);
    const { db } = fakeStore();
    await syncMirror(db);
    expect(tcgdexScan).not.toHaveBeenCalled();
    expect(ptcgScan).not.toHaveBeenCalled();
  });

  it("skips a set whose facts could not be read, and carries on with the rest", async () => {
    englishSets.mockResolvedValue([set("down", 1, "2026/01/01"), set("up", 1, "2025/01/01")]);
    englishSet.mockImplementation(async (id: string) => {
      if (id === "down") throw new Error("TCGdex facts for down unavailable");
      return { set: set(id, 1, "2025/01/01"), cards: [hit(`${id}-001`, "001")] };
    });
    const { db, calls } = fakeStore();
    const report = await syncMirror(db, { parallel: 1 });
    expect(report.failed).toEqual(["down"]);
    expect(report.copied).toEqual(["up"]);
    expect(calls.filter((c) => c.table === "catalogue_sync" && c.op === "upsert")).toHaveLength(1);
  });

  it("does not empty a set the catalogue answered nothing for", async () => {
    englishSets.mockResolvedValue([set("empty", 0, "2026/01/01")]);
    englishSet.mockResolvedValue({ set: set("empty", 0, "2026/01/01"), cards: [] });
    const { db, calls } = fakeStore();
    await syncMirror(db);
    expect(calls.find((c) => c.table === "catalogue_cards" && c.op === "delete")).toBeUndefined();
    expect(
      calls.find((c) => c.table === "catalogue_sync" && c.op === "upsert")?.args[0],
    ).toMatchObject({
      cards: 0,
    });
  });
});

describe("searchMirror, pictures", () => {
  it("hands a hit whose copied picture is not a file of ours no picture at all", async () => {
    const { db } = fakeStore({
      catalogue_cards: [row()],
      rpc: [hitRow({ image: "/api/cover?url=https%3A%2F%2Flimitless%2FSVP_102.png" })],
    });
    const found = await searchMirror(db, "Charizard", 1);
    expect(found?.cards[0]).toMatchObject({ image: null, imageHigh: null });
  });
});

describe("buildIndex", () => {
  const OURS = "https://images.cardorb.com/en/sv/sv03.5";
  it("writes a set once and each card as an array, with a seventh element only where the scan is elsewhere", () => {
    const index = buildIndex("v1", [
      row({ image: `${OURS}/006` }),
      row({
        id: "sv03.5-007",
        local_id: "007",
        name: "Charmeleon",
        rarity: "Uncommon",
        types: ["Fire"],
        image: `${OURS}/007`,
      }),
      row({ id: "sv03.5-008", local_id: "008", name: "Nobody", image: null }),
      row({
        id: "sv03.5-009",
        local_id: "009",
        name: "Elsewhere",
        image: "https://images.cardorb.com/pokemontcg/sv3pt5/9.png",
      }),
    ]);
    expect(index.version).toBe("v1");
    expect(index.sets).toEqual({
      "sv03.5": {
        name: "151",
        series: "Scarlet & Violet",
        date: "2023/09/22",
        image: OURS,
      },
    });
    expect(index.cards).toEqual([
      ["sv03.5-006", "sv03.5", "006", "Charizard ex", "Double Rare", ["Fire"]],
      ["sv03.5-007", "sv03.5", "007", "Charmeleon", "Uncommon", ["Fire"]],
      ["sv03.5-008", "sv03.5", "008", "Nobody", "Double Rare", ["Fire"], null],
      [
        "sv03.5-009",
        "sv03.5",
        "009",
        "Elsewhere",
        "Double Rare",
        ["Fire"],
        "https://images.cardorb.com/pokemontcg/sv3pt5/9.png",
      ],
    ]);
  });

  it("writes a set's printed code where it has one, for the browser's search", () => {
    const index = buildIndex(
      "v1",
      [row(), row({ id: "xyp-XY124", set_id: "xyp", local_id: "XY124" })],
      {
        "sv03.5": "MEW",
      },
    );
    expect(index.sets["sv03.5"]?.code).toBe("MEW");
    expect(index.sets.xyp).not.toHaveProperty("code");
  });

  it("names no folder and no scan that is not a file of ours", () => {
    const index = buildIndex("v1", [
      row(),
      row({ id: "sv03.5-009", local_id: "009", name: "Elsewhere", image: "https://limitless/x" }),
    ]);
    expect(index.sets["sv03.5"]?.image).toBeNull();
    expect(index.cards.map((c) => c[6] ?? null)).toEqual([null, null]);
  });
});

describe("catalogueIndex", () => {
  /** The three reads catalogueIndex makes, answered from a stored document and one card. */
  const store = (stored: { version: string; body: string } | null) => {
    const written: unknown[] = [];
    const chain = (answer: unknown) => {
      const c: Record<string, unknown> = {};
      for (const op of ["select", "order", "limit", "eq", "range"]) c[op] = () => c;
      c.maybeSingle = () => Promise.resolve({ data: stored, error: null });
      c.then = (resolve: (v: unknown) => unknown) => resolve(answer);
      return c;
    };
    const db = {
      from: (table: string) => {
        if (table === "catalogue_sync")
          return chain({ data: [{ synced_at: "2026-09-12T02:00:00+00:00" }], error: null });
        if (table === "catalogue_index")
          return {
            ...chain({ data: null, error: null }),
            upsert: (v: unknown) => {
              written.push(v);
              return Promise.resolve({ error: null });
            },
          };
        return chain({ data: [row()], error: null, count: 1 });
      },
    } as unknown as SupabaseClient;
    return { db, written };
  };

  it("builds again a document stored before the cards were in binder order", async () => {
    const { db, written } = store({ version: "2026-09-12T02:00:00+00:00", body: "{}" });
    const index = await catalogueIndex(db);
    expect(index?.version).toBe("2026-09-12T02:00:00+00:00#n4");
    expect(written).toHaveLength(1);
  });

  it("builds again a document stored before every picture was our own", async () => {
    const { db, written } = store({ version: "2026-09-12T02:00:00+00:00#n2", body: "{}" });
    expect((await catalogueIndex(db))?.version).toBe("2026-09-12T02:00:00+00:00#n4");
    expect(written).toHaveLength(1);
  });

  it("builds again a document stored before its sets carried their printed code", async () => {
    const { db, written } = store({ version: "2026-09-12T02:00:00+00:00#n3", body: "{}" });
    expect((await catalogueIndex(db))?.version).toBe("2026-09-12T02:00:00+00:00#n4");
    expect(written).toHaveLength(1);
  });

  it("keeps a document built in the current format from the same copy", async () => {
    const stored = { version: "2026-09-12T02:00:00+00:00#n4", body: "{}" };
    const { db, written } = store(stored);
    expect(await catalogueIndex(db)).toEqual(stored);
    expect(written).toHaveLength(0);
  });
});

describe("storeSetArt", () => {
  // Bart, 2026-09-14: a shelf tile's logo was the last thing loaded from somebody else's host.
  it("copies every set's logo and symbol into our bucket and points the copy at it", async () => {
    keepImage.mockImplementation(async (address: string | null) =>
      address?.startsWith("https://assets.tcgdex.net/")
        ? address.replace("https://assets.tcgdex.net/", "https://images.cardorb.com/")
        : address,
    );
    const { db, calls } = fakeStore({
      catalogue_sets: [
        {
          id: "sv01",
          logo: "https://assets.tcgdex.net/en/sv/sv01/logo.webp",
          symbol: "https://assets.tcgdex.net/en/sv/sv01/symbol.webp",
        },
        { id: "base1", logo: "https://images.cardorb.com/en/base/base1/logo.webp", symbol: null },
        { id: "jumbo", logo: null, symbol: null },
      ],
    });

    expect(await storeSetArt(db)).toBe(1);

    const updates = calls.filter((c) => c.table === "catalogue_sets" && c.op === "update");
    expect(updates.map((u) => u.args[0])).toEqual([
      {
        logo: "https://images.cardorb.com/en/sv/sv01/logo.webp",
        symbol: "https://images.cardorb.com/en/sv/sv01/symbol.webp",
      },
    ]);
    // A set whose art is ours already, or that has none, is not asked about.
    expect(keepImage).toHaveBeenCalledTimes(2);
  });

  it("takes TCGdex's PNG where it has no WebP, and drops a file that is not there at all", async () => {
    keepImage.mockImplementation(async (address: string | null) =>
      address === "https://assets.tcgdex.net/en/xy/xy3/logo.png"
        ? "https://images.cardorb.com/en/xy/xy3/logo.png"
        : address,
    );
    vi.stubGlobal("fetch", async () => new Response(null, { status: 404 }));
    const { db, calls } = fakeStore({
      catalogue_sets: [
        {
          id: "xy3",
          logo: "https://assets.tcgdex.net/en/xy/xy3/logo.webp",
          symbol: "https://assets.tcgdex.net/univ/xy/xy3/symbol.webp",
        },
      ],
    });
    expect(await storeSetArt(db)).toBe(1);
    vi.unstubAllGlobals();
    expect(calls.find((c) => c.op === "update")?.args[0]).toEqual({
      logo: "https://images.cardorb.com/en/xy/xy3/logo.png",
      symbol: null,
    });
  });

  it("leaves a set as it is when its file cannot be copied", async () => {
    keepImage.mockImplementation(async (address: string | null) => address);
    vi.stubGlobal("fetch", async () => {
      throw new Error("offline");
    });
    const { db, calls } = fakeStore({
      catalogue_sets: [
        { id: "sv01", logo: "https://assets.tcgdex.net/en/sv/sv01/logo.webp", symbol: null },
      ],
    });
    expect(await storeSetArt(db)).toBe(0);
    vi.unstubAllGlobals();
    expect(calls.some((c) => c.op === "update")).toBe(false);
  });
});
