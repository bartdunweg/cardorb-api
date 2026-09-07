import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The set index is memoised at module level and never re-fetched inside a run,
 * so every test imports the module fresh and installs its own fetch.
 */
const SETS = [
  { id: "swsh12", name: "Silver Tempest" },
  { id: "smp", name: "SM Black Star Promos" },
  { id: "swshp", name: "SWSH Black Star Promos" },
  { id: "swsh12tg", name: "Silver Tempest Trainer Gallery" },
  { id: "swsh12pt5", name: "Crown Zenith" },
  { id: "swsh12pt5gg", name: "Crown Zenith Galarian Gallery" },
  { id: "sv1", name: "Scarlet & Violet" },
];

/** Their real numbering, which the collection's gallery rows do not follow. */
const CARDS: Record<string, { number: string; name: string }[]> = {
  swsh12tg: [
    { number: "TG04", name: "Jynx" },
    { number: "TG09", name: "Druddigon" },
    { number: "TG17", name: "Mawile V" },
  ],
  swsh12pt5gg: [{ number: "GG01", name: "Chikorita" }],
  /** A promo set numbers its cards after itself, where the collection keeps the digits. */
  smp: [
    { number: "SM190", name: "Detective Pikachu" },
    { number: "SM191", name: "Mewtwo & Mew-GX" },
  ],
  /** Longer than one page: the card wanted here is on the second, as SWSH282 really is. */
  swshp: [
    ...Array.from({ length: 250 }, (_, i) => ({ number: `SWSH${i + 1}`, name: `Filler ${i + 1}` })),
    { number: "SWSH282", name: "Galarian Articuno" },
  ],
};

/** Every URL this served 200, in call order. */
let asked: string[] = [];

/**
 * @param has - the image URLs that exist; everything else answers 404.
 * @param cardsDown - make the card-list endpoint refuse, as that host does.
 */
function installFetch(has: string[], cardsDown = false) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: { method?: string }) => {
      const url = String(input);
      if (url.includes("/v2/sets")) {
        return new Response(JSON.stringify({ data: SETS }), { status: 200 });
      }
      if (url.includes("/v2/cards")) {
        if (cardsDown) return new Response("nope", { status: 502 });
        const id = url.match(/set\.id:([a-z0-9]+)/)?.[1] ?? "";
        // As that host pages: 250 at a time, and the caller stops at a short page.
        const page = Number(url.match(/page=(\d+)/)?.[1] ?? 1);
        const all = CARDS[id] ?? [];
        return new Response(JSON.stringify({ data: all.slice((page - 1) * 250, page * 250) }), {
          status: 200,
        });
      }
      if (init?.method === "HEAD") {
        asked.push(url);
        return new Response(null, { status: has.includes(url) ? 200 : 404 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }),
  );
}

const load = async () => {
  vi.resetModules();
  return import("./ptcg");
};

beforeEach(() => {
  asked = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ptcgScan", () => {
  it("asks the parent set for an ordinary number, without its leading zeros", async () => {
    installFetch(["https://images.pokemontcg.io/swsh12/4.png"]);
    const { ptcgScan } = await load();

    expect(await ptcgScan("Silver Tempest", "004")).toBe(
      "https://images.pokemontcg.io/swsh12/4.png",
    );
  });

  it("asks the Trainer Gallery subset for a TG number the row's name confirms", async () => {
    installFetch(["https://images.pokemontcg.io/swsh12tg/TG04.png"]);
    const { ptcgScan } = await load();

    expect(await ptcgScan("Silver Tempest", "TG04", "Jynx")).toBe(
      "https://images.pokemontcg.io/swsh12tg/TG04.png",
    );
    // Never under the parent, where that number would be a different card.
    expect(asked).not.toContain("https://images.pokemontcg.io/swsh12/TG04.png");
  });

  it("refuses a gallery number that holds a different card", async () => {
    installFetch(["https://images.pokemontcg.io/swsh12tg/TG04.png"]);
    const { ptcgScan } = await load();

    // The collection files Druddigon at TG04; they have it at TG09. Showing
    // their TG04 would be a picture of Jynx.
    expect(await ptcgScan("Silver Tempest", "TG04", "Druddigon")).toBeNull();
    expect(asked).toHaveLength(0);
  });

  it("looks past a card-type suffix, the way a TCGdex match does", async () => {
    installFetch(["https://images.pokemontcg.io/swsh12tg/TG17.png"]);
    const { ptcgScan } = await load();

    // Filed as "Mawile", published as "Mawile V".
    expect(await ptcgScan("Silver Tempest", "TG17", "Mawile")).toBe(
      "https://images.pokemontcg.io/swsh12tg/TG17.png",
    );
  });

  it("refuses a gallery number with no name to check it against", async () => {
    installFetch(["https://images.pokemontcg.io/swsh12tg/TG04.png"]);
    const { ptcgScan } = await load();

    expect(await ptcgScan("Silver Tempest", "TG04")).toBeNull();
  });

  it("refuses a gallery number when the card list cannot be reached", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    installFetch(["https://images.pokemontcg.io/swsh12tg/TG04.png"], true);
    const { ptcgScan } = await load();

    expect(await ptcgScan("Silver Tempest", "TG04", "Jynx")).toBeNull();
  });

  it("asks the Galarian Gallery subset for a GG number", async () => {
    installFetch(["https://images.pokemontcg.io/swsh12pt5gg/GG01.png"]);
    const { ptcgScan } = await load();

    expect(await ptcgScan("Crown Zenith", "GG01", "Chikorita")).toBe(
      "https://images.pokemontcg.io/swsh12pt5gg/GG01.png",
    );
  });

  it("falls back to the parent, unchecked, when the set has no gallery", async () => {
    installFetch(["https://images.pokemontcg.io/sv1/TG01.png"]);
    const { ptcgScan } = await load();

    expect(await ptcgScan("Scarlet & Violet", "TG01", "Sprigatito")).toBe(
      "https://images.pokemontcg.io/sv1/TG01.png",
    );
  });

  it("keeps the empty slot when they have not published the card", async () => {
    installFetch([]);
    const { ptcgScan } = await load();

    expect(await ptcgScan("Silver Tempest", "TG04", "Jynx")).toBeNull();
  });

  it("answers nothing for a set neither catalogue name matches", async () => {
    installFetch(["https://images.pokemontcg.io/swsh12/4.png"]);
    const { ptcgScan } = await load();

    expect(await ptcgScan("A Set That Does Not Exist", "004")).toBeNull();
    expect(asked).toHaveLength(0);
  });
});

describe("isGalleryNumber", () => {
  it("recognises the two gallery runs and nothing else", async () => {
    const { isGalleryNumber } = await load();

    for (const n of ["TG01", "tg20", "GG01", " TG04 "]) expect(isGalleryNumber(n)).toBe(true);
    // A letter prefix is not enough: these are ordinary numbers in their own sets.
    for (const n of ["004", "TG", "SV044", "XY67a", "143A"]) expect(isGalleryNumber(n)).toBe(false);
  });
});

describe("ptcgScan on a promo set", () => {
  it("asks the set what it calls the card when the bare number is a 404", async () => {
    installFetch(["https://images.pokemontcg.io/smp/SM191.png"]);
    const { ptcgScan } = await load();
    // The collection writes "191"; this host files the picture under "SM191".
    expect(await ptcgScan("SM Black Star Promos", "191", "Mewtwo & Mew GX")).toBe(
      "https://images.pokemontcg.io/smp/SM191.png",
    );
    // The bare number is tried first, because that is right for every other set.
    expect(asked[0]).toBe("https://images.pokemontcg.io/smp/191.png");
  });

  it("will not hand over a picture whose name disagrees with the row", async () => {
    installFetch(["https://images.pokemontcg.io/smp/SM190.png"]);
    const { ptcgScan } = await load();
    expect(await ptcgScan("SM Black Star Promos", "190", "Mewtwo & Mew GX")).toBeNull();
  });

  it("says nothing rather than guessing when the row has no name to check against", async () => {
    installFetch(["https://images.pokemontcg.io/smp/SM191.png"]);
    const { ptcgScan } = await load();
    expect(await ptcgScan("SM Black Star Promos", "191")).toBeNull();
  });
});

describe("ptcgScan on a set longer than one page", () => {
  it("reads on to the second page, where a promo set keeps its highest numbers", async () => {
    installFetch(["https://images.pokemontcg.io/swshp/SWSH282.png"]);
    const { ptcgScan } = await load();
    expect(await ptcgScan("SWSH Black Star Promos", "282", "Galarian Articuno")).toBe(
      "https://images.pokemontcg.io/swshp/SWSH282.png",
    );
  });
});
