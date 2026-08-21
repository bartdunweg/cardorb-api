"use client";

import { useCallback, useMemo, useState } from "react";
import type { CardSet } from "../../lib/core/cards";
import type { CatalogueMatch } from "../../lib/core/ptcg-search";
import { groupByEra } from "../../lib/core/eras";
import AppSidebar from "@/components/custom/AppSidebar";
import AppTabBar from "@/components/custom/AppTabBar";
import CardAddDialog from "@/components/custom/CardAddDialog";
import { CollectionProvider, type CollectionValue } from "./CollectionContext";
import { cardsMainClassName } from "@/components/custom/cardsPageClasses";

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
  failed = false,
  children,
}: {
  viewer: { username: string; email: string; avatarUrl: string | null };
  sets: CardSet[];
  /** Whether the fetch behind `sets` gave up. An empty collection and an
   *  unreachable one arrive here as the same empty array otherwise. */
  failed?: boolean;
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
  /**
   * The card the dialog should open already holding, when it was opened from
   * somewhere that knows which card you meant — the browse grid, so far.
   *
   * Cleared by onAdd() rather than left standing: the plus button means "a card,
   * I will tell you which", and inheriting the last one browsed would be the
   * dialog answering a question nobody asked.
   */
  const [prefill, setPrefill] = useState<CatalogueMatch | null>(null);
  /** How many times the dialog has been opened, so a prefilled one can be
   *  remounted per opening. See the `key` on CardAddDialog below. */
  const [opened, setOpened] = useState(0);
  const onAdd = useCallback(() => {
    setPrefill(null);
    setAdding(true);
  }, []);
  const onAddCard = useCallback((match: CatalogueMatch) => {
    setPrefill(match);
    setOpened((n) => n + 1);
    setAdding(true);
  }, []);

  const value = useMemo<CollectionValue>(
    () => ({
      sets,
      setGroups,
      viewer,
      failed,
      brokenScans,
      brokenLogos,
      onBrokenScan,
      onBrokenLogo,
      onAdd,
      onAddCard,
    }),
    [
      sets,
      setGroups,
      viewer,
      failed,
      brokenScans,
      brokenLogos,
      onBrokenScan,
      onBrokenLogo,
      onAdd,
      onAddCard,
    ],
  );

  return (
    <CollectionProvider value={value}>
      {/* Out of sight rather than out of the document. What you can see already
          says which screen this is; a visible title over both panes would be a
          third thing saying it. It sits above both because either can be the
          one on screen. */}
      <h1 className="sr-only">Card Orb</h1>

      <AppSidebar />
      {/* The sibling. Nothing may come between these two.

          This is the <main> for every signed-in route, and it has to be this
          element rather than a wrapper further out: the rail and the tab bar
          are its siblings, so a landmark drawn around all three would put the
          navigation inside the thing "Skip to content" is meant to skip past.
          That is the bug it was. `<main>` in place of `<section>` changes no
          styling — cards.css binds to the .cards-main class name, not the tag.

          The sr-only <h1> above stays outside it deliberately: it names the app
          rather than the pane, and either pane can be the one on screen below
          1000px. */}
      <main id="main-content" className={cardsMainClassName}>
        {children}
      </main>
      <AppTabBar />

      <CardAddDialog
        /**
         * One instance for the plus button, a fresh one per prefilled opening.
         *
         * The dialog reads `prefill` in its initial state rather than in an
         * effect — reacting to a prop with setState is a cascading render, and
         * it would also overwrite anything typed after the first pass. Initial
         * state only runs on mount, so a new card needs a new instance, and
         * `opened` counts openings so that adding the same card twice in a row
         * still gets a clean form the second time.
         *
         * The plus button deliberately keeps the constant key it always had:
         * its state surviving a close and reopen is existing behaviour, and
         * this change has no business altering it.
         */
        key={prefill ? `prefill-${opened}` : "blank"}
        open={adding}
        prefill={prefill}
        onClose={() => setAdding(false)}
        // Signing out from under the dialog is the one failure it cannot
        // recover from on its own: the form would post into a 401 and say the
        // card was refused rather than that the session was.
        onUnauthorised={() => setAdding(false)}
      />
    </CollectionProvider>
  );
}
