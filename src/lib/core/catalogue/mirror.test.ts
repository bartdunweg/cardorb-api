import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const englishSets = vi.fn();
const englishSet = vi.fn();
/** Which numbers TCGdex names no scan for, and the set's printed code; none unless a test says so. */
const setScans = vi.fn(async () => ({ gaps: new Set<string>(), code: null as string | null }));
vi.mock("./tcgdex-browse", () => ({
  englishSets: () => englishSets(),
  englishSet: (...a: unknown[]) => englishSet(...a),
  englishSetScans: (...a: unknown[]) => setScans(...(a as [])),
}));

/** Whether a built address holds a file, and what the two other catalogues have instead. */
const tcgdexScan = vi.fn(async (base: string) => base as string | null);
const limitlessScan = vi.fn(async () => null as string | null);
const ptcgScan = vi.fn(async () => null as string | null);
vi.mock("./artwork", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  tcgdexScan: (...a: unknown[]) => tcgdexScan(...(a as [string])),
  limitlessScan: (...a: unknown[]) => limitlessScan(...(a as [])),
}));
vi.mock("./ptcg", () => ({ ptcgScan: (...a: unknown[]) => ptcgScan(...(a as [])) }));

const { buildIndex, forgetCopy, mirrorQuery, searchMirror, syncMirror } = await import("./mirror");

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
      "select",
      "ilike",
      "contains",
      "order",
      "range",
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
  return { db: { from } as unknown as SupabaseClient, calls };
}

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
  it("answers null before the first night has copied anything", async () => {
    const { db, calls } = fakeStore();
    expect(await searchMirror(db, "charizard")).toBeNull();
    expect(calls.find((c) => c.table === "catalogue_cards")).toBeUndefined();
  });

  it("asks the copy for every word, and hands a hit back in the add-card form's shape", async () => {
    const { db, calls } = fakeStore({
      catalogue_sync: [{ set_id: "sv03.5" }],
      catalogue_cards: [row()],
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
          image: "https://assets.tcgdex.net/en/sv/sv03.5/006/low.webp",
          imageHigh: "https://assets.tcgdex.net/en/sv/sv03.5/006/high.webp",
          rarity: "Double Rare",
          types: ["Fire"],
          category: null,
          trainerType: null,
          tcgId: "sv03.5-006",
        },
      ],
    });
    const asked = calls.filter((c) => c.table === "catalogue_cards");
    expect(asked.filter((c) => c.op === "ilike").map((c) => c.args)).toEqual([
      ["search", "%charizard%"],
      ["search", "%151%"],
    ]);
    expect(asked.find((c) => c.op === "contains")?.args).toEqual(["types", ["Fire"]]);
    expect(asked.find((c) => c.op === "range")?.args).toEqual([0, 19]);
  });

  it("makes a pattern character in a word literal", async () => {
    const { db, calls } = fakeStore({ catalogue_sync: [{ set_id: "x" }] });
    await searchMirror(db, "100%");
    expect(calls.find((c) => c.op === "ilike")?.args).toEqual(["search", "%100\\%%"]);
  });

  it("pages twenty at a time", async () => {
    const { db, calls } = fakeStore({ catalogue_sync: [{ set_id: "x" }] });
    await searchMirror(db, "charizard", 3);
    expect(calls.find((c) => c.op === "range")?.args).toEqual([40, 59]);
  });

  it("remembers that the copy is there, rather than counting before every search", async () => {
    const { db, calls } = fakeStore({ catalogue_sync: [{ set_id: "x" }] });
    await searchMirror(db, "a");
    await searchMirror(db, "b");
    expect(calls.filter((c) => c.table === "catalogue_sync")).toHaveLength(1);
  });

  it("draws a hit without a scan as its name", async () => {
    const { db } = fakeStore({
      catalogue_sync: [{ set_id: "x" }],
      catalogue_cards: [row({ image: null })],
    });
    const found = await searchMirror(db, "charizard");
    expect(found?.cards[0]).toMatchObject({ image: null, imageHigh: null });
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
    ptcgScan.mockResolvedValue(null);
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
        { set_id: "grown", cards: 10, synced_at: "2026-09-10T00:00:00Z" },
        { set_id: "stale", cards: 10, synced_at: "2026-09-01T00:00:00Z" },
        { set_id: "fresh", cards: 10, synced_at: "2026-09-11T00:00:00Z" },
      ],
    });
    const report = await syncMirror(db, { parallel: 1 });
    expect(report.copied).toEqual(["new", "grown", "stale", "fresh"]);
    expect(report.left).toBe(0);
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
      catalogue_sync: [{ set_id: "svp", cards: 1, synced_at: "2026-09-12T00:00:00Z" }],
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
      catalogue_sync: [{ set_id: "svp", cards: 1, synced_at: "2026-09-12T00:00:00Z" }],
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

  it("takes the scan TCGdex has published since, on a card the copy had none for", async () => {
    englishSets.mockResolvedValue([set("svp", 1, "2023/06/30")]);
    englishSet.mockResolvedValue({
      set: set("svp", 1, "2023/06/30"),
      cards: [hit("svp-190", "190")],
    });
    setScans.mockResolvedValue({ gaps: new Set(["190"]), code: "SVP" });
    const { db, calls } = fakeStore({
      catalogue_sync: [{ set_id: "svp", cards: 1, synced_at: "2026-09-12T00:00:00Z" }],
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
      catalogue_sync: [{ set_id: "svp", cards: 1, synced_at: "2026-09-12T00:00:00Z" }],
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
      catalogue_sync: [{ set_id: "svp", cards: 1, synced_at: "2026-09-12T00:00:00Z" }],
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

describe("buildIndex", () => {
  it("writes a set once and each card as an array, with a seventh element only where the scan is elsewhere", () => {
    const index = buildIndex("v1", [
      row(),
      row({
        id: "sv03.5-007",
        local_id: "007",
        name: "Charmeleon",
        rarity: "Uncommon",
        types: ["Fire"],
        image: "https://assets.tcgdex.net/en/sv/sv03.5/007",
      }),
      row({ id: "sv03.5-008", local_id: "008", name: "Nobody", image: null }),
      row({ id: "sv03.5-009", local_id: "009", name: "Elsewhere", image: "https://limitless/x" }),
    ]);
    expect(index.version).toBe("v1");
    expect(index.sets).toEqual({
      "sv03.5": {
        name: "151",
        series: "Scarlet & Violet",
        date: "2023/09/22",
        image: "https://assets.tcgdex.net/en/sv/sv03.5",
      },
    });
    expect(index.cards).toEqual([
      ["sv03.5-006", "sv03.5", "006", "Charizard ex", "Double Rare", ["Fire"]],
      ["sv03.5-007", "sv03.5", "007", "Charmeleon", "Uncommon", ["Fire"]],
      ["sv03.5-008", "sv03.5", "008", "Nobody", "Double Rare", ["Fire"], null],
      ["sv03.5-009", "sv03.5", "009", "Elsewhere", "Double Rare", ["Fire"], "https://limitless/x"],
    ]);
  });
});
