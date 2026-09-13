import { beforeEach, describe, expect, it, vi } from "vitest";

const json = vi.fn();
vi.mock("./tcgdex-client", () => ({ json: (...args: unknown[]) => json(...args) }));

const { defaultFinish, defaultFinishFor, withDefaultFinishes } = await import("./default-finish");

beforeEach(() => json.mockReset());

describe("defaultFinish", () => {
  it("is the only printing where the catalogue has one", () => {
    expect(defaultFinish([{ finish: "holo", foilPattern: null }])).toBe("holo");
  });

  it("is the only finish where one finish comes in two foils", () => {
    expect(
      defaultFinish([
        { finish: "holo", foilPattern: null },
        { finish: "holo", foilPattern: "cosmos" },
      ]),
    ).toBe("holo");
  });

  it("is normal where there are several, or no answer", () => {
    expect(
      defaultFinish([
        { finish: "normal", foilPattern: null },
        { finish: "reverse-holo", foilPattern: null },
      ]),
    ).toBe("normal");
    expect(defaultFinish([])).toBe("normal");
  });
});

describe("defaultFinishFor", () => {
  it("asks the catalogue the card lives in", async () => {
    json.mockResolvedValueOnce({ variants_detailed: [{ type: "holo" }] });
    expect(await defaultFinishFor("sv10-233", "ja")).toBe("holo");
    expect(json.mock.calls[0]![0]).toBe("https://api.tcgdex.net/v2/ja/cards/sv10-233");
  });

  it("is normal without an id, and when TCGdex does not answer", async () => {
    expect(await defaultFinishFor(null, null)).toBe("normal");
    expect(json).not.toHaveBeenCalled();
    json.mockRejectedValueOnce(new Error("503"));
    expect(await defaultFinishFor("sv10-233", null)).toBe("normal");
  });
});

describe("withDefaultFinishes", () => {
  const row = (
    over: Partial<{ owned: boolean; finish: "holo" | "normal" | null; tcgId: string | null }>,
  ) => ({
    owned: true,
    finish: null,
    tcgId: "sv10-233",
    language: null,
    ...over,
  });

  it("fills owned rows without a finish, asking once per card", async () => {
    json.mockResolvedValue({ variants_detailed: [{ type: "holo" }] });
    const out = await withDefaultFinishes([row({}), row({}), row({ finish: "normal" })]);
    expect(out.map((r) => r.finish)).toEqual(["holo", "holo", "normal"]);
    expect(json).toHaveBeenCalledTimes(1);
  });

  it("leaves a wish without one", async () => {
    const out = await withDefaultFinishes([row({ owned: false })]);
    expect(out[0]!.finish).toBeNull();
    expect(json).not.toHaveBeenCalled();
  });
});
