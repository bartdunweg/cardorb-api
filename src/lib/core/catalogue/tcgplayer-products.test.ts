import { afterEach, describe, expect, it, vi } from "vitest";
import TCGPLAYER_IDS from "../tcgplayer-ids.generated.json";
import TCGPLAYER_GROUPS from "../tcgplayer-groups.generated.json";
import { productFactsOf, tcgdexStage } from "./tcgplayer-products";

describe("tcgdexStage", () => {
  it("writes TCGplayer's stage in the words the copy already holds", () => {
    expect(tcgdexStage("Basic")).toBe("Basic");
    expect(tcgdexStage("Stage 1")).toBe("Stage1");
    expect(tcgdexStage("1")).toBe("Stage1");
    expect(tcgdexStage("Stage 2")).toBe("Stage2");
    expect(tcgdexStage("V-Union")).toBe("V-UNION");
    expect(tcgdexStage("Level Up")).toBe("LEVEL-UP");
    expect(tcgdexStage("Primal")).toBe("MEGA");
    expect(tcgdexStage("BREAK Evolution")).toBe("BREAK");
    expect(tcgdexStage("bASIC")).toBe("Basic");
  });

  it("fills nothing from a word it does not know", () => {
    expect(tcgdexStage("Mysterious")).toBeNull();
    expect(tcgdexStage(null)).toBeNull();
  });
});

describe("productFactsOf", () => {
  afterEach(() => vi.unstubAllGlobals());

  /* Mew-EX of Legendary Treasures' Radiant Collection, through the product links as committed. */
  const card = "bw11-RC24";
  const productId = (TCGPLAYER_IDS as Record<string, { productId: number } | null>)[card]
    ?.productId;
  const groupId = (TCGPLAYER_GROUPS as Record<string, Record<string, number>>)["3"]![
    String(productId)
  ];

  it("reads the card's group once and answers its product's name and stage", async () => {
    const asked: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      asked.push(url);
      return Response.json({
        results: [
          { productId: 1, name: "Booster Pack" },
          {
            productId,
            name: "Mew EX (Full Art)",
            extendedData: [
              { name: "Number", value: "RC24/RC25" },
              { name: "Stage", value: "Basic" },
            ],
          },
        ],
      });
    });
    const facts = await productFactsOf([card, "no-such-card"]);
    expect(asked).toEqual([`https://tcgcsv.com/tcgplayer/3/${groupId}/products`]);
    expect([...facts]).toEqual([[card, { name: "Mew EX (Full Art)", stage: "Basic" }]]);
  });

  it("throws where the group does not answer, so the set is not written without it", async () => {
    vi.stubGlobal("fetch", async () => new Response(null, { status: 503 }));
    await expect(productFactsOf([card])).rejects.toThrow("503");
  });

  it("asks nothing for cards with no product", async () => {
    const fetched = vi.fn();
    vi.stubGlobal("fetch", fetched);
    expect((await productFactsOf(["no-such-card"])).size).toBe(0);
    expect(fetched).not.toHaveBeenCalled();
  });
});
