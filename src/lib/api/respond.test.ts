import { describe, expect, it } from "vitest";
import { REFUSALS, apiError, refuse, retryAfter, unavailable } from "./respond";

describe("apiError", () => {
  it("answers { error } at the status it was given", async () => {
    const res = apiError(404, "No such card.");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "No such card." });
  });

  it("keeps extra keys beside the sentence, never instead of it", async () => {
    const res = apiError(403, "Confirm first.", { unconfirmed: true });
    expect(await res.json()).toEqual({ error: "Confirm first.", unconfirmed: true });
  });

  it("passes headers through", () => {
    const res = apiError(429, "Too many requests", undefined, {
      headers: { "Retry-After": "60" },
    });
    expect(res.headers.get("Retry-After")).toBe("60");
  });
});

describe("refuse", () => {
  it("uses the shared pair", async () => {
    const res = refuse("tooLarge");
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "Payload too large" });
  });

  it("words no-database once, and it is a full sentence", () => {
    expect(REFUSALS.noDatabase.error).toBe("This deployment has no database configured.");
  });

  it("words a catalogue that did not answer once, as a sentence and not a slug", () => {
    expect(REFUSALS.catalogue).toEqual({
      status: 502,
      error: "The catalogue did not answer. Try again in a moment.",
    });
  });
});

describe("retryAfter", () => {
  it("is the one header a 429 carries, in whole seconds", () => {
    expect(retryAfter(60)).toEqual({ "Retry-After": "60" });
  });
});

describe("unavailable", () => {
  it("is a 503 nothing caches, about the collection unless told otherwise", async () => {
    const res = unavailable();
    expect(res.status).toBe(503);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({
      error: "The collection could not be read. Try again in a moment.",
    });
  });

  it("says the sentence it was given, at the same status and headers", async () => {
    const res = unavailable("That card could not be read. Try again in a moment.");
    expect(res.status).toBe(503);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({
      error: "That card could not be read. Try again in a moment.",
    });
  });
});
