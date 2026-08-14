import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { seal, open, sealingAvailable } = await import("./secrets");

/** A real 32-byte key, as `openssl rand -hex 32` would produce one. */
const KEY = "a".repeat(64);
const OTHER = "b".repeat(64);

beforeEach(() => vi.stubEnv("SECRETS_KEY", KEY));
afterEach(() => vi.unstubAllEnvs());

describe("sealing a credential", () => {
  it("comes back out the way it went in", () => {
    const token = "ntn_notion_integration_token_example";
    expect(open(seal(token))).toBe(token);
  });

  it("never produces the same ciphertext twice", () => {
    // A fresh nonce per call. Without one, two people connecting the same
    // Notion database would have identical rows, which tells anybody reading
    // the table that they match — and repeats under GCM are worse than that.
    expect(seal("same")).not.toBe(seal("same"));
  });

  it("carries a version, so a key can be rotated later", () => {
    // Without this prefix a re-keyed row is indistinguishable from a corrupt
    // one, and rotation becomes "decrypt everything and hope".
    expect(seal("x").startsWith("v1.")).toBe(true);
  });

  it("refuses a ciphertext that was tampered with", () => {
    const sealed = seal("secret");
    const [v, iv, tag, body] = sealed.split(".");
    // Flip a byte of the ciphertext. Without authentication this would decrypt
    // to *something*, and the caller would send that somewhere as a token.
    const flipped = Buffer.from(body!, "base64url");
    flipped[0] = (flipped[0] ?? 0) ^ 0xff;
    const attacked = [v, iv, tag, flipped.toString("base64url")].join(".");

    expect(() => open(attacked)).toThrow(/not readable/);
  });

  it("refuses a ciphertext whose tag was replaced", () => {
    const [v, iv, , body] = seal("secret").split(".");
    const wrongTag = Buffer.alloc(16, 7).toString("base64url");
    expect(() => open([v, iv, wrongTag, body].join("."))).toThrow(/not readable/);
  });

  it("refuses the right ciphertext under the wrong key", () => {
    const sealed = seal("secret");
    vi.stubEnv("SECRETS_KEY", OTHER);
    expect(() => open(sealed)).toThrow(/not readable/);
  });

  it("says the same thing however it failed", () => {
    // One message for every failure. Which part an attacker got right is not
    // something to tell them, and the caller can do nothing with the difference.
    const sealed = seal("secret");
    const messages = new Set<string>();
    for (const bad of ["", "v1.a.b", "v2." + sealed.slice(3), sealed.slice(0, -4)]) {
      try {
        open(bad);
      } catch (e) {
        messages.add((e as Error).message);
      }
    }
    expect(messages.size).toBe(1);
  });

  it("refuses to work with a key that is not 32 bytes", () => {
    // A short key is a silent downgrade: it would still encrypt, just weakly.
    vi.stubEnv("SECRETS_KEY", "abcd");
    expect(() => seal("x")).toThrow(/32 bytes/);
    expect(sealingAvailable()).toBe(false);
  });

  it("says so when the deployment has no key at all", () => {
    vi.stubEnv("SECRETS_KEY", "");
    expect(sealingAvailable()).toBe(false);
    expect(() => seal("x")).toThrow(/not set/);
  });
});
