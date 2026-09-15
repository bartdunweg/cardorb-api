import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { imageKey } from "./image-store";
import { HAND_ORIGIN, handCardPicture, handEntries } from "./pictures-by-hand";

describe("pictures found by hand", () => {
  it("names a committed file and the page it was found on, for every entry", () => {
    for (const entry of handEntries()) {
      expect(existsSync(join("public", "pictures-by-hand", entry.file)), entry.file).toBe(true);
      expect(entry.page, entry.file).toMatch(/^https:\/\//);
      expect(entry.source, entry.file).toMatch(/^https:\/\//);
    }
  });

  it("is copied into the bucket under hand/, and nothing else on this host is", () => {
    expect(imageKey(`${HAND_ORIGIN}/ja/neo2-057.jpg`)).toBe("hand/ja/neo2-057.jpg");
    expect(imageKey(`${HAND_ORIGIN}/logos/en/mfb.png`)).toBe("hand/logos/en/mfb.png");
    expect(imageKey("https://api.cardorb.com/artwork/pokedex/25.png")).toBeNull();
    expect(imageKey(`${HAND_ORIGIN}/../secrets.png`)).toBeNull();
  });

  it("answers nothing for a card nobody found a picture for", () => {
    expect(handCardPicture("en", "no-such-card")).toBeNull();
  });
});
