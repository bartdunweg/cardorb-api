"use client";

import { useRef } from "react";
import { Boxes, Heart, LayoutDashboard, Layers, ListOrdered, Plus, Search } from "lucide-react";
import { useSlidingPill } from "../hooks/useSlidingPill";

/**
 * The bottom bar on /cards, below 1000px, where the rail is not beside the
 * cards but instead of them.
 *
 * The site's own bar wearing this route's destinations, the same way the
 * favourites shelves do it (see FavoritesView): TabBar stands down here anyway,
 * so the place along the bottom of the screen is free and a second bar built
 * out of something else would be a second bar. Everything it looks like comes
 * from tabbar.css; cards.css only says where it stands and how wide its slots
 * are.
 *
 * Buttons rather than links, which is where it parts from favourites: that
 * route has a URL per shelf and this one has no URL per set, so there is no
 * href to honour and nothing for a middle click to open.
 *
 * No labels at any width. With the theme toggle's footprint reserved on both
 * sides (layout.css), a 360px phone leaves about 214px of track, and five
 * labelled slots do not fit it. The names are on aria-label and title, which is
 * what the favourites bar already does for four of its six.
 */

/**
 * Where the sliding pill may land. The plus is not one of these.
 *
 * Two different bars, because the two modes have different room. Signed in the
 * plus takes the middle, so four slots is the ceiling: five plus a circle does
 * not divide a 360px phone into anything readable. Profile loses out and lives
 * in the rail, which is fair, since signing in happens once per device.
 *
 * The public link has no plus and no dashboard, which buys back two slots, and
 * they go to Collection and Wishlist. Those were rail-only rows, so on a phone
 * the only way back to the whole collection was through the menu the rail
 * opens — which is a menu standing in front of the two screens anyone came to
 * see. Sets keeps its own slot for what it is actually for, picking one.
 */
export type CardsTab = "dashboard" | "collection" | "wishlist" | "sets" | "search" | "pokedex";

const ICON = { size: 20, strokeWidth: 1.75 } as const;

export default function CardsTabBar({
  active,
  signedIn,
  isPublic = false,
  onSelect,
  onAdd,
}: {
  active: CardsTab | null;
  /** The plus is only in the bar once the key is in (see the profile screen). */
  signedIn: boolean;
  /** No Dashboard on the public link: it is three tiles and two charts there. */
  isPublic?: boolean;
  onSelect: (tab: CardsTab) => void;
  onAdd: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const {
    pill,
    animate,
    style: pillStyle,
  } = useSlidingPill(trackRef, ".tabbar-item.is-active", [active, signedIn, isPublic]);

  const all: Record<string, { key: CardsTab; label: string; icon: React.ReactNode }> = {
    dashboard: {
      key: "dashboard",
      label: "Dashboard",
      icon: <LayoutDashboard {...ICON} aria-hidden="true" />,
    },
    collection: {
      key: "collection",
      label: "Collection",
      icon: <Layers {...ICON} aria-hidden="true" />,
    },
    wishlist: { key: "wishlist", label: "Wishlist", icon: <Heart {...ICON} aria-hidden="true" /> },
    // Boxes rather than Layers, which Collection now wears: the rail is a shelf
    // of fifty sets to pick from, not another view of the whole thing.
    sets: { key: "sets", label: "Sets", icon: <Boxes {...ICON} aria-hidden="true" /> },
    search: { key: "search", label: "Search", icon: <Search {...ICON} aria-hidden="true" /> },
    pokedex: {
      key: "pokedex",
      label: "Pokédex",
      icon: <ListOrdered {...ICON} aria-hidden="true" />,
    },
  };

  const order = isPublic
    ? ["collection", "wishlist", "sets", "search", "pokedex"]
    : ["dashboard", "sets", "search", "pokedex"];
  const shown = order.map((k) => all[k]!);

  // The plus sits in the middle, which is why the list is split rather than
  // mapped in one go: it is the thing you came to the bar to do, and on a phone
  // the middle is the thumb's own place. With no plus the split is invisible,
  // because both halves land in the same flex row.
  const half = Math.ceil(shown.length / 2);
  const left = shown.slice(0, half);
  const right = shown.slice(half);

  const item = (tab: (typeof shown)[number]) => {
    const on = tab.key === active;
    return (
      <button
        key={tab.key}
        type="button"
        className={`tabbar-item${on ? " is-active" : ""}`}
        aria-current={on ? "page" : undefined}
        aria-label={tab.label}
        title={tab.label}
        onClick={() => onSelect(tab.key)}
      >
        <span className="tabbar-icon">{tab.icon}</span>
      </button>
    );
  };

  return (
    <>
      <div className="tabbar-fade cards-tabbar-fade" aria-hidden="true" />
      {/* "Cards" rather than "Collection", which is the rail's name: both are on
          the page at once, and two landmarks with one name is a list of two
          identical entries in a screen reader's rotor. This one is the route,
          that one is the sets in it. */}
      <nav className="tabbar cards-tabbar" aria-label="Cards">
        <div className="tabbar-pages" ref={trackRef}>
          {/* One pill for the whole control, behind the icons. */}
          <span
            className={`tabbar-pill${pill.ready ? " is-ready" : ""}${animate ? " is-animated" : ""}`}
            aria-hidden="true"
            style={pillStyle}
          />
          {left.map(item)}
          {signedIn && (
            <button type="button" className="cards-tabbar-add" onClick={onAdd} title="Add a card">
              <Plus size={20} strokeWidth={2} aria-hidden="true" />
              <span className="sr-only">Add a card</span>
            </button>
          )}
          {right.map(item)}
        </div>
      </nav>
    </>
  );
}
