"use client";

import { useCallback, useMemo, useState } from "react";
import type { CardSet } from "../../lib/core/cards";
import { groupByEra } from "../../lib/core/eras";
import AppSidebar from "../components/AppSidebar";
import AppTabBar from "../components/AppTabBar";
import CardAddDialog from "../components/CardAddDialog";
import { CollectionProvider, type CollectionValue } from "./CollectionContext";
import { cardsMainClassName } from "../components/cardsPageClasses";

/**
 * The furniture around every signed-in screen.
 *
 * The one structural rule this file exists to keep: **the rail and .cards-main
 * are literal siblings, in that order.** app/styles/cards.css leans on it twice
 * — the pane swap is written as `.cards-rail[data-pane="rail"] + .cards-main`,
 * and .cards-main carries `container-type: inline-size`, which every card-grid
 * breakpoint in the stylesheet is measured against rather than the viewport.
 * Wrap either of them in anything and the grid reflows for reasons nobody will
 * connect to the file they changed.
 *
 * That is also why the pages are `children` rather than props. A server layout
 * hands them in and this client component places them inside the existing
 * .cards-main, so the markup the stylesheet was written for is unchanged while
 * everything above it becomes routing. RSC children pass through a client
 * component untouched, which is the whole trick.
 *
 * State that belongs to the shell rather than to any screen: the add dialog,
 * because every screen can open it; and the sets of images that answered 404,
 * because they are learned by scrolling and would be re-learned on every
 * navigation if they lived in a page.
 */
export default function AppShell({
  viewer,
  sets,
  children,
}: {
  viewer: { username: string; email: string };
  sets: CardSet[];
  children: React.ReactNode;
}) {
  const [adding, setAdding] = useState(false);
  const [brokenScans, setBrokenScans] = useState<Set<string>>(new Set());
  const [brokenLogos, setBrokenLogos] = useState<Set<string>>(new Set());

  /**
   * The rail lists the collection, so a set is only in it once something from
   * it is held. Three sets in the collection this was built against are
   * wishlist-only; before this they sat in the rail reading "0" and opened onto
   * nothing, which looks like a set that failed to load rather than one that
   * has not been started. They stay reachable under Wishlist.
   */
  const setGroups = useMemo(
    () => groupByEra(sets.filter((set) => set.cards.some((card) => card.owned))),
    [sets],
  );

  const onBrokenScan = useCallback((key: string) => {
    setBrokenScans((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
  }, []);
  const onBrokenLogo = useCallback((name: string) => {
    setBrokenLogos((prev) => (prev.has(name) ? prev : new Set(prev).add(name)));
  }, []);
  const onAdd = useCallback(() => setAdding(true), []);

  const value = useMemo<CollectionValue>(
    () => ({ sets, setGroups, viewer, brokenScans, brokenLogos, onBrokenScan, onBrokenLogo, onAdd }),
    [sets, setGroups, viewer, brokenScans, brokenLogos, onBrokenScan, onBrokenLogo, onAdd],
  );

  return (
    <CollectionProvider value={value}>
      {/* Out of sight rather than out of the document. What you can see already
          says which screen this is; a visible title over both panes would be a
          third thing saying it. It sits above both because either can be the
          one on screen. */}
      <h1 className="sr-only">Card Orb</h1>

      <AppSidebar />
      {/* The sibling. Nothing may come between these two. */}
      <section className={cardsMainClassName}>{children}</section>
      <AppTabBar />

      <CardAddDialog
        open={adding}
        onClose={() => setAdding(false)}
        // Signing out from under the dialog is the one failure it cannot
        // recover from on its own: the form would post into a 401 and say the
        // card was refused rather than that the session was.
        onUnauthorised={() => setAdding(false)}
      />
    </CollectionProvider>
  );
}
