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
        if (query.includes("series")) return Response.json({ data: answers.index ?? INDEX });
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

const INDEX = {
  series: [
    { name: "Platinum", sets: [{ id: "pl4", name: "Arceus" }] },
    {
      name: "Scarlet & Violet",
      sets: [
        { id: "sv03.5", name: "151" },
        { id: "sv03", name: "Obsidian Flames" },
      ],
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
        if (url.endsWith("/graphql") && init?.body?.includes("series"))
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

    expect(calls.filter((c) => c.body?.includes("series"))).toHaveLength(1);
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
