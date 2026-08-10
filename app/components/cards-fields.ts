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

export type Option = { value: string; count: number };


export type Facet = {
  key: string;
  label: string;
  options: Option[];
  /** Read-only here: a control only ever asks what is on. A mutable Set is
      still accepted; this just does not claim the right to change one. */
  selected: ReadonlySet<string>;
  onToggle: (value: string) => void;
  onClear: () => void;
  /**
   * The whole selection at once, for a control that stages its changes instead
   * of applying them as they are made. FilterMenu never calls this — it applies
   * a tick the moment it is made, which is right for a dropdown you can see the
   * page behind. FilterSheet does, because a sheet covers the page and there is
   * nothing to watch change until it closes.
   */
  onReplace: (next: Set<string>) => void;
  /** How to show an option, when it reads better than the raw value. */
  display?: (value: string) => string;
};
