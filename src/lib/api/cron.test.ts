import { afterEach, describe, expect, it } from "vitest";
import { refuseCron, secretMatches } from "./cron";

const SECRET = "s3cr3t-value-of-some-length";

/** A request offering `token` as its bearer, or none at all when it is null. */
function asking(token: string | null): Request {
  return new Request("https://api.cardorb.com/api/v1/cron/warm", {
    headers: token === null ? {} : { authorization: `Bearer ${token}` },
  });
}

const previous = process.env.CRON_SECRET;
afterEach(() => {
  if (previous === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = previous;
});

describe("secretMatches", () => {
  it("is true for the secret itself", () => {
    expect(secretMatches(SECRET, SECRET)).toBe(true);
  });

  it("is false for a wrong guess of exactly the same length", () => {
    const wrong = `${SECRET.slice(0, -1)}X`;
    expect(wrong).toHaveLength(SECRET.length);
    expect(secretMatches(wrong, SECRET)).toBe(false);
  });

  it("is false for a guess of the wrong length, both shorter and longer", () => {
    expect(secretMatches(SECRET.slice(0, -1), SECRET)).toBe(false);
    expect(secretMatches(`${SECRET}X`, SECRET)).toBe(false);
  });

  it("is false for nothing offered at all", () => {
    expect(secretMatches(null, SECRET)).toBe(false);
    expect(secretMatches(undefined, SECRET)).toBe(false);
    expect(secretMatches("", SECRET)).toBe(false);
  });

  it("is false for every guess when there is no secret to match", () => {
    expect(secretMatches("", "")).toBe(false);
    expect(secretMatches(SECRET, "")).toBe(false);
  });

  it("does not let a multi-byte character stand in for two", () => {
    // "é" is one character and two bytes: compared as characters this would be the same length
    // as a two-character guess, and timingSafeEqual would then be asked to compare 2 bytes with 3.
    expect(secretMatches("ab", "é")).toBe(false);
  });
});

describe("refuseCron", () => {
  it("lets the right bearer through", () => {
    process.env.CRON_SECRET = SECRET;
    expect(refuseCron(asking(SECRET), "warm")).toBeNull();
  });

  it("allows the secret to be padded in the environment", () => {
    process.env.CRON_SECRET = `  ${SECRET}  `;
    expect(refuseCron(asking(SECRET), "warm")).toBeNull();
  });

  it("answers 401 to a wrong bearer of the same length", async () => {
    process.env.CRON_SECRET = SECRET;
    const refusal = refuseCron(asking(`${SECRET.slice(0, -1)}X`), "warm");
    expect(refusal?.status).toBe(401);
    expect(await refusal?.json()).toEqual({ error: "No." });
  });

  it("answers 401 to a bearer of the wrong length", () => {
    process.env.CRON_SECRET = SECRET;
    expect(refuseCron(asking("short"), "warm")?.status).toBe(401);
  });

  it("answers 401 when no bearer is offered", () => {
    process.env.CRON_SECRET = SECRET;
    expect(refuseCron(asking(null), "warm")?.status).toBe(401);
  });

  it("answers 503 and never 401 when the secret is unset", async () => {
    delete process.env.CRON_SECRET;
    const refusal = refuseCron(asking(SECRET), "warm");
    expect(refusal?.status).toBe(503);
    expect(await refusal?.json()).toEqual({ error: "Not configured." });
  });

  it("answers 503 when the secret is set to nothing but whitespace", () => {
    process.env.CRON_SECRET = "   ";
    expect(refuseCron(asking(""), "warm")?.status).toBe(503);
  });
});
