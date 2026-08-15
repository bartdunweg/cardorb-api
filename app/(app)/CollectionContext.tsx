"use client";

import { createContext, useContext } from "react";
import type { CardSet } from "../../lib/core/cards";
import type { EraGroup } from "../../lib/core/eras";

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

  /** Scans and logos that answered 404, so nothing asks twice. */
  brokenScans: Set<string>;
  brokenLogos: Set<string>;
  onBrokenScan: (key: string) => void;
  onBrokenLogo: (name: string) => void;

  /** Opening the add dialog, which lives in the shell so every screen can. */
  onAdd: () => void;
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
