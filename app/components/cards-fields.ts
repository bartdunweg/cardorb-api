/**
 * The two vocabularies the collection's controls share.
 *
 * They were declared in CardsView, and ViewMenu, ViewSheet and CardsPokedex
 * imported them from there — so three components pulled in a 1,900-line client
 * module for a union and a list of seven pairs. A constant that three files
 * need is not part of the component that happens to have declared it first.
 */

/** Which slice of the dex a filter is asking for. */
export type DexOwned = "all" | "owned" | "wishlist" | "missing";

/** The optional facts a tile can carry. Its name is always drawn. */
export type CardField = "number" | "type" | "era" | "year" | "rarity" | "price" | "set";

/** In the order the View control offers them, which is the order they read. */
export const CARD_FIELDS: readonly (readonly [CardField, string])[] = [
  ["number", "Number"],
  ["type", "Type"],
  ["era", "Era"],
  ["year", "Year"],
  ["set", "Set"],
  ["rarity", "Rarity"],
  ["price", "Price"],
];
