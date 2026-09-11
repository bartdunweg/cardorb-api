import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Call = { url: string; body?: string };
let calls: Call[] = [];

/** TCGdex answered like this: the list by URL substring, GraphQL by what the query asks. */
type Answers = {
  list?: unknown;
  listStatus?: number;
  index?: unknown;
  facts?: unknown;
  factsStatus?: number;
};

function installFetch(answers: Answers) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: { method?: string; body?: string }) => {
      const url = String(input);
      calls.push({ url, body: init?.body });
      if (url.endsWith("/graphql")) {
        const query = JSON.parse(init?.body ?? "{}").query as string;
        if (query.includes("sets {")) return Response.json({ data: answers.index ?? INDEX });
        return new Response(JSON.stringify({ data: answers.facts ?? {} }), {
          status: answers.factsStatus ?? 200,
        });
      }
      return new Response(JSON.stringify(answers.list ?? []), {
        status: answers.listStatus ?? 200,
      });
    }),
  );
}

/** The English set index as tcgdex-browse.ts asks for it. */
const INDEX = {
  sets: [
    { id: "pl4", name: "Arceus", serie: { name: "Platinum" }, releaseDate: "2009-03-01" },
    { id: "sv03.5", name: "151", serie: { name: "Scarlet & Violet" }, releaseDate: "2023-09-22" },
    {
      id: "sv03",
      name: "Obsidian Flames",
      serie: { name: "Scarlet & Violet" },
      releaseDate: "2023-08-11",
    },
    {
      id: "A1",
      name: "Genetic Apex",
      serie: { id: "tcgp", name: "Pokémon TCG Pocket" },
      releaseDate: "2024-10-30",
    },
  ],
};

const brief = (id: string, localId: string, name: string, image: string | null = null) => ({
  id,
  localId,
  name,
  image,
});

const load = async () => {
  vi.resetModules();
  return import("./tcgdex-search");
};

/** The hits alone: what most of these tests are about. `total` has its own test below. */
const loadCards = async () => {
  const { searchCards } = await load();
  return {
    searchCards: async (...args: Parameters<typeof searchCards>) =>
      (await searchCards(...args)).cards,
  };
};

const listCall = () => calls.find((c) => c.url.includes("/en/cards?"));
const listParams = () => new URL(listCall()!.url).searchParams;

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("searchCards", () => {
  it("maps a hit into the shape the add-card form uses, with set and era from the index", async () => {
    installFetch({
      list: [brief("pl4-1", "1", "Charizard", "https://assets.tcgdex.net/en/pl/pl4/1")],
      facts: { c0: { rarity: "Holo Rare", types: ["Fire"] } },
    });
    const { searchCards } = await loadCards();

    expect(await searchCards("char")).toEqual([
      {
        id: "pl4-1",
        number: "1",
        name: "Charizard",
        localName: null,
        setName: "Arceus",
        series: "Platinum",
        image: "https://assets.tcgdex.net/en/pl/pl4/1/low.webp",
        imageHigh: "https://assets.tcgdex.net/en/pl/pl4/1/high.webp",
        rarity: "Holo Rare",
        types: ["Fire"],
        tcgId: "pl4-1",
      },
    ]);
  });

  it("leaves a hit from the mobile game out, and out of the count", async () => {
    installFetch({
      list: [brief("pl4-1", "1", "Charizard"), brief("A1-036", "036", "Charizard ex")],
    });
    const { searchCards } = await load();
    const { cards, total } = await searchCards("charizard");
    expect(cards.map((c) => c.id)).toEqual(["pl4-1"]);
    expect(total).toBe(1);
  });

  it("asks TCGdex's list for the name, cached briefly, and reads a window rather than a page", async () => {
    installFetch({ list: [] });
    const { searchCards } = await loadCards();
    await searchCards("charizard");

    const params = listParams();
    expect(params.get("name")).toBe("like:charizard");
    expect(params.get("pagination:page")).toBe("1");
    expect(params.get("pagination:itemsPerPage")).toBe("250");
  });

  it("matches the words that cannot be a filter against name, number and set name here", async () => {
    installFetch({
      list: [
        brief("pl4-1", "1", "Charizard"),
        brief("sv03.5-006", "006", "Charizard ex"),
        brief("sv03-151", "151", "Charizard"),
      ],
    });
    const { searchCards } = await loadCards();

    const hits = await searchCards("charizard 151");
    expect(hits.map((h) => h.id)).toEqual(["sv03.5-006", "sv03-151"]);
    expect(listParams().get("name")).toBe("like:charizard");
  });

  it("turns a word that is an energy type into the type filter", async () => {
    installFetch({ list: [] });
    const { searchCards } = await loadCards();
    await searchCards("charizard fire");

    expect(listParams().get("name")).toBe("like:charizard");
    expect(listParams().get("types")).toBe("Fire");
  });

  it("asks for a number when nothing typed could be a name", async () => {
    installFetch({ list: [] });
    const { searchCards } = await loadCards();
    await searchCards("151");

    expect(listParams().get("localId")).toBe("like:151");
    expect(listParams().has("name")).toBe(false);
  });

  it("caps the number of words a query can grow to", async () => {
    installFetch({ list: [brief("pl4-1", "1", "Charizard")] });
    const { searchCards } = await loadCards();

    // Six words are matched; the seventh, which nothing matches, is dropped.
    expect(await searchCards("charizard 1 arceus char ard zard nothing")).toHaveLength(1);
  });

  it("skips a hit missing a number or a name", async () => {
    installFetch({
      list: [
        { id: "pl4-1", localId: "1" },
        { id: "pl4-2", name: "Charizard" },
      ],
    });
    const { searchCards } = await loadCards();

    expect(await searchCards("char")).toEqual([]);
  });

  it("leaves rarity and types empty when the facts cannot be read, rather than losing the hit", async () => {
    installFetch({ list: [brief("pl4-1", "1", "Charizard")], factsStatus: 500 });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { searchCards } = await loadCards();

    const hit = (await searchCards("char"))[0]!;
    expect(hit.name).toBe("Charizard");
    expect(hit.rarity).toBeNull();
    expect(hit.types).toEqual([]);
  });

  it("names a set by its id when the index is down, rather than failing the search", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string, init?: { body?: string }) => {
        const url = String(input);
        if (url.endsWith("/graphql") && init?.body?.includes("sets {"))
          return new Response("", { status: 503 });
        if (url.endsWith("/graphql")) return Response.json({ data: {} });
        return Response.json([brief("pl4-1", "1", "Charizard")]);
      }),
    );
    const { searchCards } = await loadCards();

    const hit = (await searchCards("char"))[0]!;
    expect(hit.setName).toBe("pl4");
    expect(hit.series).toBeNull();
  });

  it("reads the set index once for many searches", async () => {
    installFetch({ list: [brief("pl4-1", "1", "Charizard")] });
    const { searchCards } = await loadCards();
    await searchCards("char");
    await searchCards("chari");

    expect(calls.filter((c) => c.body?.includes("sets {"))).toHaveLength(1);
  });

  it("throws once the list cannot be read, rather than returning empty", async () => {
    installFetch({ listStatus: 500 });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { searchCards } = await loadCards();

    await expect(searchCards("char")).rejects.toThrow();
  });

  it("targets each filter field precisely, AND'd by the host", async () => {
    installFetch({ list: [] });
    const { searchCards } = await loadCards();
    await searchCards({ name: "char", number: "4", set: "Base Set", type: "fire" });

    const params = listParams();
    expect(params.get("name")).toBe("like:char");
    expect(params.get("localId")).toBe("like:4");
    expect(params.get("set.name")).toBe("like:Base Set");
    expect(params.get("types")).toBe("Fire");
  });

  it("only includes filter fields that were actually filled in", async () => {
    installFetch({ list: [] });
    const { searchCards } = await loadCards();
    await searchCards({ name: "char", number: "", set: "  ", type: "" });

    const params = listParams();
    expect(params.get("name")).toBe("like:char");
    expect(params.has("localId")).toBe(false);
    expect(params.has("set.name")).toBe(false);
    expect(params.has("types")).toBe(false);
  });

  it("returns no results and makes no request for empty filters", async () => {
    installFetch({ list: [] });
    const { searchCards } = await loadCards();

    expect(await searchCards({})).toEqual([]);
    expect(await searchCards("   ")).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("pages through the window twenty at a time", async () => {
    const list = Array.from({ length: 25 }, (_, i) =>
      brief(`pl4-${i + 1}`, String(i + 1), "Charizard"),
    );
    installFetch({ list });
    const { searchCards } = await loadCards();

    expect((await searchCards("char")).map((h) => h.number)).toEqual(
      list.slice(0, 20).map((c) => c.localId),
    );
    expect((await searchCards("char", 2)).map((h) => h.number)).toEqual([
      "21",
      "22",
      "23",
      "24",
      "25",
    ]);
  });

  it("asks for the facts of the page shown, in one query", async () => {
    installFetch({ list: [brief("pl4-1", "1", "Charizard"), brief("pl4-2", "2", "Charmeleon")] });
    const { searchCards } = await loadCards();
    await searchCards("char");

    const facts = calls.filter((c) => c.body?.includes("card(id:"));
    expect(facts).toHaveLength(1);
    const query = JSON.parse(facts[0]!.body!).query as string;
    expect(query).toContain('c0: card(id: "pl4-1")');
    expect(query).toContain('c1: card(id: "pl4-2")');
  });

  it("says how many the whole search matched, across every page", async () => {
    const list = Array.from({ length: 25 }, (_, i) =>
      brief(`pl4-${i + 1}`, String(i + 1), "Charizard"),
    );
    installFetch({ list });
    const { searchCards } = await load();

    const first = await searchCards("char");
    expect(first.cards).toHaveLength(20);
    expect(first.total).toBe(25);
    expect((await searchCards("char", 2)).total).toBe(25);
    expect((await searchCards({})).total).toBe(0);
  });
});

describe("searchCards with the catalogue's copy", () => {
  /** A store whose copy holds one row, or nothing yet. Every builder call answers the seed. */
  const store = (cards: unknown[], copied = true) => {
    const chain: Record<string, unknown> = {};
    let table = "";
    for (const op of ["select", "ilike", "contains", "order", "range"]) chain[op] = () => chain;
    chain.then = (resolve: (v: unknown) => unknown) =>
      resolve(
        table === "catalogue_sync"
          ? { data: null, error: null, count: copied ? 1 : 0 }
          : { data: cards, error: null, count: cards.length },
      );
    return {
      from: (t: string) => {
        table = t;
        return chain;
      },
    } as never;
  };
  const copy = {
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
  };

  it("answers from the copy, rarity included, and asks TCGdex nothing", async () => {
    installFetch({ list: [brief("pl4-1", "1", "Charizard")] });
    const { searchCards } = await load();
    const { cards, total } = await searchCards("charizard", 1, null, store([copy]));
    expect(cards.map((c) => [c.id, c.rarity, c.setName])).toEqual([
      ["sv03.5-006", "Double Rare", "151"],
    ]);
    expect(total).toBe(1);
    expect(calls).toHaveLength(0);
  });

  it("asks TCGdex as before while the copy is empty", async () => {
    installFetch({ list: [brief("pl4-1", "1", "Charizard")] });
    const { searchCards } = await load();
    const { cards } = await searchCards("charizard", 1, null, store([], false));
    expect(cards.map((c) => c.id)).toEqual(["pl4-1"]);
    expect(listCall()).toBeDefined();
  });

  it("asks TCGdex when the store will not answer, rather than failing the search", async () => {
    installFetch({ list: [brief("pl4-1", "1", "Charizard")] });
    const broken = { from: () => ({ select: () => Promise.reject(new Error("down")) }) } as never;
    const { searchCards } = await load();
    const { cards } = await searchCards("charizard", 1, null, broken);
    expect(cards.map((c) => c.id)).toEqual(["pl4-1"]);
  });

  it("leaves the copy alone for another language's shelf", async () => {
    installFetch({ list: [brief("sv1s-001", "001", "リザードン")], index: { sets: [] } });
    const { searchCards } = await load();
    await searchCards("リザードン", 1, "ja", store([copy]));
    expect(calls.some((c) => c.url.includes("/ja/"))).toBe(true);
  });
});

describe("searchCards in another language", () => {
  /** TCGdex's Japanese catalogue, by URL: the series list, one serie with its sets, the cards. */
  function installJapanese(list: unknown[]) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string, init?: { method?: string; body?: string }) => {
        const url = String(input);
        calls.push({ url, body: init?.body });
        if (url.endsWith("/ja/series"))
          return Response.json([{ id: "sv", name: "スカーレット&バイオレット" }]);
        if (url.endsWith("/ja/series/sv"))
          return Response.json({
            id: "sv",
            name: "スカーレット&バイオレット",
            sets: [
              { id: "SV2a", name: "ポケモンカード151", cardCount: { total: 210, official: 165 } },
            ],
          });
        if (url.includes("/ja/cards?")) return Response.json(list);
        // The scan probe: the file is there for every set but SV5M, which TCGdex has not photographed.
        if (init?.method === "HEAD")
          return new Response("", { status: url.includes("/SV5M/") ? 404 : 200 });
        return new Response("not here", { status: 500 });
      }),
    );
  }

  it("asks that language's catalogue, names the set the way its shelf does, and asks no facts", async () => {
    installJapanese([
      brief("SV2a-006", "006", "リザードンex", "https://assets.tcgdex.net/ja/SV/SV2a/006"),
    ]);
    const { searchCards } = await load();
    const { cards, total } = await searchCards("リザードン", 1, "ja");
    expect(total).toBe(1);
    expect(cards[0]).toMatchObject({
      id: "SV2a-006",
      number: "006",
      name: "リザードンex",
      // The shelf's own naming: the English title where the set has one (tcgdex-browse.ts, named).
      setName: "Pokémon Card 151",
      // Limitless's plain print: SV2a is the set TCGdex photographed as its Master Ball variant
      // (artwork.ts), and a search hit goes through the same step a set page's card does.
      image: `/api/cover?url=${encodeURIComponent("https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/SV2a/SV2a_6_R_JP_SM.png")}`,
      rarity: null,
      types: [],
      tcgId: "SV2a-006",
    });
    const list = calls.find((c) => c.url.includes("/ja/cards?"));
    expect(new URL(list!.url).searchParams.get("name")).toBe("like:リザードン");
    expect(calls.some((c) => c.url.includes("/en/"))).toBe(false);
    expect(calls.some((c) => c.url.endsWith("/graphql"))).toBe(false);
  });

  it("gives a hit the record names no picture for Limitless's address, without a probe", async () => {
    installJapanese([brief("SV1a-007", "007", "マスカーニャex", null)]);
    const { searchCards } = await load();
    const { cards } = await searchCards("マスカーニャ", 1, "ja");
    expect(cards[0]!.image).toBe(
      `/api/cover?url=${encodeURIComponent("https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/SV1a/SV1a_7_R_JP_SM.png")}`,
    );
    expect(calls.filter((c) => c.url.includes("low.webp"))).toHaveLength(0);
  });

  it("swaps the hits of a set TCGdex has not photographed, one probe per set on the page", async () => {
    installJapanese([
      brief("SV5M-001", "001", "ストライク", "https://assets.tcgdex.net/ja/SV/SV5M/001"),
      brief("SV1a-007", "007", "マスカーニャex", "https://assets.tcgdex.net/ja/SV/SV1a/007"),
      brief("SV5M-002", "002", "ハッサム", "https://assets.tcgdex.net/ja/SV/SV5M/002"),
    ]);
    const { searchCards } = await load();
    const { cards } = await searchCards("ス", 1, "ja");
    expect(cards.map((c) => c.id)).toEqual(["SV5M-001", "SV1a-007", "SV5M-002"]);
    expect(cards[0]!.image).toContain("SV5M_1_R_JP_SM.png");
    expect(cards[1]!.image).toBe("https://assets.tcgdex.net/ja/SV/SV1a/007/low.webp");
    expect(cards[2]!.image).toContain("SV5M_2_R_JP_SM.png");
    expect(calls.filter((c) => c.url.includes("low.webp")).map((c) => c.url)).toEqual([
      "https://assets.tcgdex.net/ja/SV/SV5M/001/low.webp",
      "https://assets.tcgdex.net/ja/SV/SV1a/007/low.webp",
    ]);
  });

  it("finds a card on that shelf by the English name the app shows it under, off its set", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string, init?: { method?: string }) => {
        const url = String(input);
        calls.push({ url });
        if (init?.method === "HEAD") return new Response("", { status: 200 });
        if (url.endsWith("/ja/series")) return Response.json([{ id: "M", name: "MEGA" }]);
        if (url.endsWith("/ja/series/M"))
          return Response.json({
            id: "M",
            name: "MEGA",
            sets: [{ id: "M4", name: "四", cardCount: { total: 2, official: 2 } }],
          });
        if (url.endsWith("/ja/sets/M4"))
          return Response.json({
            id: "M4",
            name: "四",
            serie: { id: "M", name: "MEGA" },
            cardCount: { total: 2, official: 2 },
            cards: [
              { id: "M4-001", localId: "001", name: "ビードル" },
              { id: "M4-002", localId: "002", name: "コクーン" },
            ],
          });
        // Every other Weedle's set, of which the map holds a dozen: a set with no cards here,
        // so those hits fall away and M4's stands alone.
        const other = /\/ja\/sets\/([^/?]+)$/.exec(url);
        if (other) return Response.json({ id: other[1], name: other[1], cards: [] });
        return new Response("not here", { status: 500 });
      }),
    );
    const { searchCards } = await load();
    // M4-001 is Weedle in the committed map, and "ビードル" is what TCGdex would have matched.
    const { cards } = await searchCards("weedle", 1, "ja");
    const hit = cards.find((c) => c.id === "M4-001");
    expect(hit).toMatchObject({
      id: "M4-001",
      number: "001",
      name: "Weedle",
      localName: "ビードル",
      setName: "Ninja Spinner",
      image: "https://assets.tcgdex.net/ja/M/M4/001/low.webp",
      tcgId: "M4-001",
    });
    // No card search was asked of TCGdex: the names are ours, the set is the one read.
    expect(calls.some((c) => c.url.includes("/ja/cards?"))).toBe(false);
    expect(calls.some((c) => c.url.includes("/en/"))).toBe(false);
  });

  it("keeps to the set the chip named, by the title the shelf shows it under", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        const url = String(input);
        calls.push({ url });
        if (url.endsWith("/ja/series")) return Response.json([{ id: "M", name: "MEGA" }]);
        if (url.endsWith("/ja/series/M"))
          return Response.json({
            id: "M",
            name: "MEGA",
            sets: [{ id: "M4", name: "四", cardCount: { total: 2, official: 2 } }],
          });
        if (url.endsWith("/ja/sets/M4"))
          return Response.json({
            id: "M4",
            name: "四",
            serie: { id: "M", name: "MEGA" },
            cardCount: { total: 2, official: 2 },
            cards: [
              { id: "M4-001", localId: "001", name: "ビードル" },
              { id: "M4-002", localId: "002", name: "コクーン" },
            ],
          });
        return new Response("not here", { status: 500 });
      }),
    );
    const { searchCards } = await load();
    // Ninja Spinner is M4's English title (set-names.ja.json); the shelf's other Weedles are out.
    const named = await searchCards({ name: "weedle", set: "Ninja Spinner" }, 1, "ja");
    expect(named.cards.map((c) => c.id)).toEqual(["M4-001"]);
    expect(named.total).toBe(1);
    // The set alone lists it whole, English name or none.
    const whole = await searchCards({ set: "Ninja Spinner" }, 1, "ja");
    expect(whole.cards.map((c) => c.id)).toEqual(["M4-001", "M4-002"]);
    // A set the shelf does not know is an empty answer, not every card.
    expect((await searchCards({ set: "Nowhere" }, 1, "ja")).total).toBe(0);
    expect(calls.some((c) => c.url.includes("/ja/cards?"))).toBe(false);
  });

  it("leaves the English catalogue as it was when no language is named", async () => {
    installFetch({ list: [brief("pl4-1", "1", "Charizard")] });
    const { searchCards } = await load();
    await searchCards("char", 1, null);
    expect(listCall()).toBeDefined();
    expect(calls.some((c) => c.url.includes("/ja/"))).toBe(false);
  });
});
