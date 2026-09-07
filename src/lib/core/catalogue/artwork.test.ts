import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tcgdexScan } from "./artwork";

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
