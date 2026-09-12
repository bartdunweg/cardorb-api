import { afterEach, describe, expect, it, vi } from "vitest";
import { westernLanguagesOf } from "./card-languages";

afterEach(() => vi.unstubAllGlobals());

/** Every Western catalogue answers 404 but the ones named. */
const answering = (...langs: string[]) =>
  vi.stubGlobal("fetch", async (url: string) => {
    const ok = langs.some((l) => url.includes(`/v2/${l}/`));
    return new Response(ok ? JSON.stringify({ id: "x-1" }) : "", { status: ok ? 200 : 404 });
  });

describe("westernLanguagesOf", () => {
  it("asks each Western catalogue and keeps the ones that carry the card", async () => {
    answering("en", "de", "pt");
    expect(await westernLanguagesOf("x-1")).toEqual(["en", "de", "pt"]);
  });

  it("keeps English alone for a card only the English catalogue has", async () => {
    answering("en");
    expect(await westernLanguagesOf("x-1")).toEqual(["en"]);
  });

  it("drops Portuguese standing alone beside English, which is a translation", async () => {
    answering("en", "pt");
    expect(await westernLanguagesOf("svp-085")).toEqual(["en"]);
  });

  it("says nothing at all where a catalogue was asked and did not answer", async () => {
    vi.stubGlobal("fetch", async (url: string) => {
      if (url.includes("/v2/de/")) throw new Error("down");
      return new Response("", { status: 404 });
    });
    expect(await westernLanguagesOf("x-1")).toBeNull();
  });
});
