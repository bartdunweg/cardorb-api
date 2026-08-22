/**
 * Which dex slots the toolbar leaves standing.
 *
 * The overlap between held and wanted is the case worth a test: it is
 * deliberate, it is explained in a comment, and a comment is exactly what a
 * future edit "fixes" by making the two exclusive.
 */

import { describe, expect, it } from "vitest";
import { dexShown } from "./CardsPokedex";
import type { DexEntry } from "@/lib/core/collection/pokedex";
import type { OwnedCard } from "@/lib/core/collection/cards";

const card = (owned: boolean): OwnedCard =>
  ({ key: `c-${owned}`, owned, variants: [] }) as unknown as OwnedCard;

const entry = (id: number, name: string, cards: OwnedCard[]): DexEntry => ({
  id,
  name,
  cards,
  owned: cards.filter((c) => c.owned).length,
});

/** One of each state a slot can be in. */
const held = entry(6, "Charizard", [card(true)]);
const wanted = entry(25, "Pikachu", [card(false)]);
const both = entry(150, "Mewtwo", [card(true), card(false)]);
const missing = entry(151, "Mew", []);
const all = [held, wanted, both, missing];

describe("dexShown", () => {
  it("shows every slot, gaps included, when nothing is asked", () => {
    expect(dexShown(all, "", "all").map((e) => e.id)).toEqual([6, 25, 150, 151]);
  });

  it("counts a Pokémon as both held and wanted when two printings disagree", () => {
    // Deliberate: one printing in the binder, another still wanted, and that
    // Pokémon is a true answer to both questions.
    expect(dexShown(all, "", "owned").map((e) => e.id)).toEqual([6, 150]);
    expect(dexShown(all, "", "wishlist").map((e) => e.id)).toEqual([25, 150]);
  });

  it("counts only an empty slot as missing", () => {
    // A wanted card is not a gap — there is a row for it.
    expect(dexShown(all, "", "missing").map((e) => e.id)).toEqual([151]);
  });

  it("searches by name and by number, and the number has to be exact", () => {
    expect(dexShown(all, "chari", "all").map((e) => e.id)).toEqual([6]);
    expect(dexShown(all, "25", "all").map((e) => e.id)).toEqual([25]);
    // "15" is not Mewtwo and not Mew: a partial number would match a third of
    // the dex.
    expect(dexShown(all, "15", "all")).toEqual([]);
  });

  it("narrows by both at once", () => {
    expect(dexShown(all, "mewtwo", "owned").map((e) => e.id)).toEqual([150]);
    expect(dexShown(all, "charizard", "wishlist")).toEqual([]);
  });
});
