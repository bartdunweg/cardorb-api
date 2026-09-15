import { describe, expect, it, vi } from "vitest";
import type { CatalogueCardSheet } from "@/lib/storage/postgres";

/* The store's client is server-only; nothing here reads it. */
vi.mock("@/lib/storage/supabase", () => ({ adminClient: () => null }));

const { detailFromSheet } = await import("./card-sheet");

const sheet = (image: string | null, logo: string | null): CatalogueCardSheet =>
  ({
    card: {
      id: "sv03.5-006",
      set_id: "sv03.5",
      local_id: "006",
      name: "Charizard ex",
      set_name: "151",
      image,
      rarity: "Double Rare",
      types: ["Fire"],
      variants: [],
      first_edition: false,
      local_name: null,
    },
    set: { id: "sv03.5", name: "151", logo, total: 207, serie_id: "sv" },
  }) as unknown as CatalogueCardSheet;

describe("detailFromSheet", () => {
  it("sends the copy's picture and wordmark where they are files of ours", () => {
    const card = detailFromSheet(
      sheet(
        "https://images.cardorb.com/en/sv/sv03.5/006",
        "https://images.cardorb.com/en/sv/sv03.5/logo.webp",
      ),
    );
    expect(card.image).toBe("https://images.cardorb.com/en/sv/sv03.5/006");
    expect(card.set?.logo).toBe("https://images.cardorb.com/en/sv/sv03.5/logo.webp");
  });

  // Bart, 2026-09-15: a client is sent only files in our bucket, whatever the copy holds.
  it("sends null for a picture or wordmark that is not a file of ours", () => {
    const card = detailFromSheet(
      sheet(
        "https://assets.tcgdex.net/en/sv/sv03.5/006",
        "https://images.pokemontcg.io/sv3pt5/logo.png",
      ),
    );
    expect(card.image).toBeNull();
    expect(card.set?.logo).toBeNull();
  });
});
