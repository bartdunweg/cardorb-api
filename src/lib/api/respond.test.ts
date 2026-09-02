import { describe, expect, it } from "vitest";
import { REFUSALS, apiError, refuse } from "./respond";

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
});
