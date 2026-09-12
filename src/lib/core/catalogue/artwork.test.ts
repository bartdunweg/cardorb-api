import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { storedScan, tcgdexScan } from "./artwork";

const BASE = "https://assets.tcgdex.net/en/sm/smp/SM191";

describe("tcgdexScan", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("hands the path over when the file is there", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    await expect(tcgdexScan(BASE)).resolves.toBe(BASE);
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(`${BASE}/low.webp`);
    expect(vi.mocked(fetch).mock.calls[0]?.[1]).toMatchObject({ method: "HEAD" });
  });

  it("says nothing rather than a 404, so the fallbacks get their turn", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    await expect(tcgdexScan(BASE)).resolves.toBeNull();
  });

  it("keeps the path when the probe itself cannot be made: an unanswered check is not proof", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("offline"));
    await expect(tcgdexScan(BASE)).resolves.toBe(BASE);
  });
});

describe("storedScan", () => {
  it("reads a stem as a folder, both sizes", () => {
    expect(storedScan("https://assets.tcgdex.net/en/sv/svp/085")).toEqual({
      image: "https://assets.tcgdex.net/en/sv/svp/085/low.webp",
      imageHigh: "https://assets.tcgdex.net/en/sv/svp/085/high.webp",
    });
  });

  it("reads a file as the one size there is: the fallbacks publish one each", () => {
    expect(storedScan("https://images.pokemontcg.io/svp/85.png")).toEqual({
      image: "https://images.pokemontcg.io/svp/85.png",
      imageHigh: null,
    });
    expect(storedScan("/api/cover?url=https%3A%2F%2Flimitless%2FSVP_085_R_EN_LG.png")).toEqual({
      image: "/api/cover?url=https%3A%2F%2Flimitless%2FSVP_085_R_EN_LG.png",
      imageHigh: null,
    });
  });

  it("answers nothing for a card with no picture, which draws as its name", () => {
    expect(storedScan(null)).toEqual({ image: null, imageHigh: null });
  });
});
