import { afterEach, describe, expect, it, vi } from "vitest";
import { westernLanguagesOf } from "./card-languages";

afterEach(() => vi.unstubAllGlobals());

describe("westernLanguagesOf", () => {
  it("asks each Western catalogue and keeps the ones that carry the card", async () => {
    vi.stubGlobal("fetch", async (url: string) => {
      const ok = /\/v2\/(en|de|pt)\//.test(url);
      return new Response(ok ? JSON.stringify({ id: "svp-085" }) : "", { status: ok ? 200 : 404 });
    });
    expect(await westernLanguagesOf("svp-085")).toEqual(["en", "de", "pt"]);
  });

  it("always keeps English, and leaves out a catalogue that does not answer", async () => {
    vi.stubGlobal("fetch", async (url: string) => {
      if (url.includes("/v2/de/")) throw new Error("down");
      return new Response("", { status: 404 });
    });
    expect(await westernLanguagesOf("x-1")).toEqual(["en"]);
  });
});
