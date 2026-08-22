"use client";

import { useRef } from "react";
import { Heart, LayersThree01, LayoutAlt01, List, SearchLg, User01 } from "@untitledui-pro/icons/line";
// The real solid cuts, not the line ones with fill turned on. Untitled UI draws
// each style separately: a solid icon is its own shape, where filling an outline
// path floods the strokes and gives a heavier, blunter form than anyone drew.
// Faking it was the only option while the free line-only package was installed.
import {
  Heart as HeartSolid,
  LayersThree01 as LayersThree01Solid,
  LayoutAlt01 as LayoutAlt01Solid,
  List as ListSolid,
  SearchLg as SearchLgSolid,
  User01 as User01Solid,
} from "@untitledui-pro/icons/solid";
import { useSlidingPill } from "@/app/hooks/useSlidingPill";
import { Avatar } from "@/components/base/avatar/avatar";
import {
  tabbarClassName,
  tabbarFadeClassName,
  tabbarIconClassName,
  tabbarItemClassName,
  tabbarLabelClassName,
  tabbarPagesClassName,
  tabbarPillClassName,
} from "@/components/shared/tabbarClasses";

/**
 * The bottom bar on /cards, below 1000px, where the rail is not beside the
 * cards but instead of them.
 *
 * Everything it looks like comes from tabbarClasses.ts, which is the whole of
 * it: this file decides which slots there are and which one is lit.
 *
 * Buttons rather than links: this route has no URL per set, so there is no href
 * to honour and nothing for a middle click to open.
 *
 * Every slot says its name, at every width, and every slot is the width of the
 * widest of those names (ADR-0086). Four labelled slots fit a 360px phone's
 * 328px of track with room to spare now that the add circle is not in the row
 * with them. Below roughly 340px the labels truncate rather than the bar
 * overflowing — the floor ADR-0050 established, unchanged.
 */

/**
 * Where the sliding pill may land.
 *
 * Two different bars, because the two modes have different places to go. Four
 * slots is the ceiling either way: five equal slots do not divide a 360px phone
 * into anything readable, which is why Sets and Pokédex sit the signed-in bar
 * out — Profile fits because it replaced Settings rather than joining it.
 *
 * The public link has no dashboard and no account to show, and gives up Search
 * as well, which leaves Collection, Wishlist and Sets. Collection and Wishlist
 * were rail-only rows, so on a phone the only way back to either was through the
 * menu the rail opens — a menu standing in front of the two screens anyone
 * followed the link to see. Sets keeps a slot for what it is actually for,
 * picking one.
 */
/**
 * The slots. "settings" joined and "search" left on the day the app got
 * addresses, and "settings" itself became "profile" ("You") once the bar
 * carried an avatar to show for it.
 *
 * Sets and Pokédex are not here any more either, and that is the same decision
 * twice: they are two ways of looking at the collection rather than two places,
 * so they belong at the head of that screen and not in a bar that reports which
 * screen you are on. Search went for a related reason — it was a slot that
 * scrolled you to a field, which is a shortcut wearing a destination's clothes.
 *
 * Four is also as many as this bar can carry at one equal width without the
 * labels truncating on a narrow phone, which is the practical half of the
 * argument.
 */
export type CardsTab = "dashboard" | "collection" | "wishlist" | "profile" | "sets" | "search";

const ICON_SIZE = { size: 20, strokeWidth: 1.75 } as const;

export default function CardsTabBar({
  active,
  signedIn,
  isPublic = false,
  viewer,
  onSelect,
}: {
  active: CardsTab | null;
  /** Which slots the bar carries: the public link has no account to show, so no
   *  "You". Nothing to do with the plus any more — that left the bar entirely
   *  (ADR-0086). */
  signedIn: boolean;
  /** No Dashboard on the public link: it is three tiles and two charts there. */
  isPublic?: boolean;
  /** The "profile" slot's avatar, undefined only until the viewer has loaded —
   *  the slot falls back to a plain person icon rather than waiting. */
  viewer?: { name: string; avatarUrl: string | null };
  onSelect: (tab: CardsTab) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const {
    pill,
    animate,
    style: pillStyle,
  } = useSlidingPill(trackRef, ".tabbar-item.is-active", [active, signedIn, isPublic]);

  // Two components per slot, not one: the active tab draws the solid cut and the
  // rest draw the line one, and which is which has to be decided per render
  // against `active` rather than once up front here.
  const all: Record<
    string,
    { key: CardsTab; label: string; icon: typeof LayoutAlt01; solid: typeof LayoutAlt01 }
  > = {
    dashboard: { key: "dashboard", label: "Dashboard", icon: LayoutAlt01, solid: LayoutAlt01Solid },
    collection: {
      key: "collection",
      label: "Collection",
      icon: LayersThree01,
      solid: LayersThree01Solid,
    },
    wishlist: { key: "wishlist", label: "Wishlist", icon: Heart, solid: HeartSolid },
    // A list rather than boxes: what this slot opens is the rail, which is a
    // list of set names to pick from. Layers belongs to Collection, which is
    // the cards themselves.
    sets: { key: "sets", label: "Sets", icon: List, solid: ListSolid },
    // Fallback icon only — item() swaps this for the viewer's avatar (or
    // their initial) whenever one is available, which is every real render
    // signed in.
    profile: { key: "profile", label: "You", icon: User01, solid: User01Solid },
    search: { key: "search", label: "Search", icon: SearchLg, solid: SearchLgSolid },
  };

  const order = isPublic
    ? // No Search slot. Searching is not a place you go, it is something you do
      // to the list you are looking at, and the field is already in the toolbar
      // above it. Signed in the slot earns its keep by jumping out of the
      // dashboard into the cards with the caret in the field; the public link
      // opens on the cards, so there is nothing to jump out of.
      ["collection", "wishlist", "sets"]
    : ["dashboard", "collection", "wishlist", "profile"];
  const shown = order.map((k) => all[k]!);

  /**
   * The slots are mapped in one go. They used to be split in half around a plus
   * that sat in the middle of the row; ADR-0086 moved that button to the
   * dashboard's title row, so there is nothing left for the two halves to sit
   * either side of.
   *
   * Still no slot-width measurement here, and deliberately none, even though the
   * slots are all one width again: a --tab-w var was once computed from the
   * widest label on mount, on document.fonts.ready and on every ResizeObserver
   * tick (ADR-0030), and ADR-0050 deleted the lot. Equal widths come from a grid
   * of fr tracks now (tabbarPagesClassName) — the browser was always going to be
   * better at this than three JavaScript hooks racing a font load.
   */

  const item = (tab: (typeof shown)[number]) => {
    const on = tab.key === active;
    const Icon = on ? tab.solid : tab.icon;
    return (
      <button
        key={tab.key}
        type="button"
        className={`${tabbarItemClassName}${on ? " is-active" : ""}`}
        aria-current={on ? "page" : undefined}
        aria-label={tab.label}
        // No `title` and no tooltip. Every slot has shown its name as visible
        // text since ADR-0050, so the native tooltip was repeating a word
        // already on screen a few pixels below itself — and a Tooltip here
        // would repeat it more elaborately. Deleted rather than converted.
        onClick={() => onSelect(tab.key)}
      >
        <span className={tabbarIconClassName}>
          {tab.key === "profile" && viewer ? (
            /* Their <Avatar>, initials fallback included. 20px is between
               their xs (24) and nothing below it, so the size comes from a
               class rather than the prop. */
            <Avatar
              src={viewer.avatarUrl}
              alt=""
              initials={viewer.name.charAt(0).toUpperCase()}
              className="size-5 shrink-0 [&_span]:text-[9px]"
            />
          ) : (
            <Icon {...ICON_SIZE} aria-hidden="true" />
          )}
        </span>
        {/* Icon and label both always on, every slot — see tabbarLabelClassName's
            own comment for what this replaced. */}
        <span className={tabbarLabelClassName}>{tab.label}</span>
      </button>
    );
  };

  return (
    <>
      <div className={`${tabbarFadeClassName} cards-tabbar-fade`} aria-hidden="true" />
      {/* "Cards" rather than "Collection", which is the rail's name: both are on
          the page at once, and two landmarks with one name is a list of two
          identical entries in a screen reader's rotor. This one is the route,
          that one is the sets in it. */}
      <nav className={`${tabbarClassName} cards-tabbar`} aria-label="Cards">
        <div className={tabbarPagesClassName} ref={trackRef}>
          {/* One pill for the whole control, behind the icons. */}
          <span
            className={`${tabbarPillClassName}${pill.ready ? " is-ready" : ""}${animate ? " is-animated" : ""}`}
            aria-hidden="true"
            style={pillStyle}
          />
          {shown.map(item)}
        </div>
      </nav>
    </>
  );
}
