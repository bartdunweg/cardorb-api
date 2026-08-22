"use client";

import { createContext, useContext } from "react";
import type { CardSet } from "@/lib/core/collection/cards";
import type { EraGroup } from "@/lib/core/catalogue/eras";
import type { CatalogueMatch } from "@/lib/core/catalogue/ptcg-search";

/**
 * The collection, once, for every screen inside the shell.
 *
 * The layout fetches it and the pages read it from here rather than each
 * fetching their own. That is not only about the megabyte: getCards() is
 * cache()d per request, so a second fetch would be cheap — but a second *copy
 * serialised to the client* would not, and a page that received its own props
 * would be re-sent the whole collection on every navigation between screens
 * that a shared layout is supposed to make free.
 *
 * So the pages are thin. A set page ships a slug and reads the set out of here;
 * the dashboard ships nothing and reads the lot.
 *
 * The broken-image sets live here for a different reason: they are learned by
 * 404 as you scroll, and they have to survive moving between screens or every
 * navigation re-discovers the same missing scans one request at a time.
 */
export type CollectionValue = {
  /** Everything, held and wanted. The dashboard counts both. */
  sets: CardSet[];
  /** Only the sets something is actually held from, grouped by era, for the rail. */
  setGroups: EraGroup[];
  viewer: { username: string; email: string; avatarUrl: string | null };
  /** Whether the fetch gave up rather than finding nothing. Empty means "add
   *  your first card" to a new account and "we could not reach the store" after
   *  an outage, and only the server can tell which happened. */
  failed: boolean;

  /** Scans and logos that answered 404, so nothing asks twice. */
  brokenScans: Set<string>;
  brokenLogos: Set<string>;
  onBrokenScan: (key: string) => void;
  onBrokenLogo: (name: string) => void;

  /** Opening the add dialog, which lives in the shell so every screen can. */
  onAdd: () => void;
  /**
   * The same dialog, opened on a card that has already been found.
   *
   * A second function rather than an argument to onAdd(), because onAdd is
   * wired straight to onClick in three places (CardsSidebar, CardsTabBar,
   * CardsView) and an optional first parameter would quietly receive a
   * MouseEvent from every one of them.
   *
   * Browse is what needs it: a set page has already identified the card you are
   * looking at, and making you type its name back into a search box to add it
   * would be the dialog asking a question the screen has answered.
   */
  onAddCard: (match: CatalogueMatch) => void;
};

/**
 * No default. A component that reads this outside the shell is a component in
 * the wrong tree, and a default object would let it render an empty collection
 * rather than say so.
 */
const CollectionContext = createContext<CollectionValue | null>(null);

export const CollectionProvider = CollectionContext.Provider;

export function useCollection(): CollectionValue {
  const value = useContext(CollectionContext);
  if (!value) {
    throw new Error("useCollection() outside the app shell — see app/(app)/layout.tsx");
  }
  return value;
}
