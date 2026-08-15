"use client";

import { useLayoutEffect, useRef } from "react";
import { Heart, LayoutDashboard, Layers, List, Plus, Search, UserRound } from "lucide-react";
import { useSlidingPill } from "../hooks/useSlidingPill";
import {
  tabbarClassName,
  tabbarFadeClassName,
  tabbarIconClassName,
  tabbarItemClassName,
  tabbarLabelClassName,
  tabbarPagesClassName,
  tabbarPillClassName,
} from "./tabbarClasses";

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
 * labelled slots do not fit it. So only the active one says its name: the rest
 * carry it on aria-label and title, and the stylesheet fades the word in beside
 * whichever icon is lit (see .tabbar-label in layout.css).
 */

/**
 * Where the sliding pill may land. The plus is not one of these.
 *
 * Two different bars, because the two modes have different room. Signed in the
 * plus takes the middle, so four slots is the ceiling: five plus a circle does
 * not divide a 360px phone into anything readable, which is why Sets and
 * Pokédex still sit this one out — Profile fits because it replaced Settings
 * rather than joining it. Signed out there is no account to show at all, so
 * the public link drops Profile along with the plus.
 *
 * The public link has no plus and no dashboard, and gives up Search as well,
 * which leaves four for the four places there are: Collection, Wishlist, Sets,
 * Pokédex. Collection and Wishlist were rail-only rows, so on a phone the only
 * way back to either was through the menu the rail opens — a menu standing in
 * front of the two screens anyone followed the link to see. Sets keeps a slot
 * for what it is actually for, picking one.
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
 * Four is also as many as this bar can carry beside the plus without the labels
 * colliding on a narrow phone, which is the practical half of the argument.
 */
export type CardsTab = "dashboard" | "collection" | "wishlist" | "profile" | "sets" | "search";

const ICON_SIZE = { size: 20, strokeWidth: 1.75 } as const;

export default function CardsTabBar({
  active,
  signedIn,
  isPublic = false,
  viewer,
  onSelect,
  onAdd,
}: {
  active: CardsTab | null;
  /** The plus is only in the bar once the key is in (see the profile screen). */
  signedIn: boolean;
  /** No Dashboard on the public link: it is three tiles and two charts there. */
  isPublic?: boolean;
  /** The "profile" slot's avatar, undefined only until the viewer has loaded —
   *  the slot falls back to a plain person icon rather than waiting. */
  viewer?: { name: string; avatarUrl: string | null };
  onSelect: (tab: CardsTab) => void;
  onAdd: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const {
    pill,
    animate,
    style: pillStyle,
  } = useSlidingPill(trackRef, ".tabbar-item.is-active", [active, signedIn, isPublic]);

  // The component itself, not a pre-built element: the active tab renders
  // its icon filled (fill="currentColor" instead of lucide's default
  // fill="none"), which has to be decided per render against `active`, not
  // once up front here.
  const all: Record<string, { key: CardsTab; label: string; icon: typeof LayoutDashboard }> = {
    dashboard: { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    collection: { key: "collection", label: "Collection", icon: Layers },
    wishlist: { key: "wishlist", label: "Wishlist", icon: Heart },
    // A list rather than boxes: what this slot opens is the rail, which is a
    // list of set names to pick from. Layers belongs to Collection, which is
    // the cards themselves.
    sets: { key: "sets", label: "Sets", icon: List },
    // Fallback icon only — item() swaps this for the viewer's avatar (or
    // their initial) whenever one is available, which is every real render
    // signed in.
    profile: { key: "profile", label: "You", icon: UserRound },
    search: { key: "search", label: "Search", icon: Search },
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

  // The plus sits in the middle, which is why the list is split rather than
  // mapped in one go: it is the thing you came to the bar to do, and on a phone
  // the middle is the thumb's own place. With no plus the split is invisible,
  // because both halves land in the same flex row.
  const half = Math.ceil(shown.length / 2);
  const left = shown.slice(0, half);
  const right = shown.slice(half);

  /**
   * Every slot's width, read off the widest label rather than guessed: a
   * hard-coded pixel estimate (see tabbarClasses.ts's history of one)
   * clipped "Dashboard" on a real phone. scrollWidth reports a label's true
   * content width even while `truncate` is visually clipping it, so this
   * doesn't need to fight the CSS to measure it. Set on the track as a CSS
   * var rather than per-button inline styles, since every slot reads the
   * same one value.
   *
   * Three ways to trigger a (re-)measurement, not one, after a first version
   * of this (mount + document.fonts.ready only) still shipped a clipped
   * label on a real device without a clear enough reason why: a plain
   * ResizeObserver on the track, matching the pattern useSlidingPill already
   * uses for the same category of problem (content whose size isn't known
   * until the browser has actually laid it out) instead of trying to
   * enumerate every event that could change it by name. tabbarItemClassName
   * also carries a deliberately generous static fallback now, so even a
   * device where none of these three fire correctly doesn't clip.
   */
  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const measure = () => {
      let max = 0;
      track.querySelectorAll<HTMLElement>(".tabbar-label").forEach((label) => {
        max = Math.max(max, label.scrollWidth);
      });
      // 16px either side of the label — tabbarItemClassName's own px-2.
      if (max > 0) track.style.setProperty("--tab-w", `${max + 16}px`);
    };
    measure();
    let cancelled = false;
    document.fonts?.ready.then(() => {
      if (!cancelled) measure();
    });
    const ro = new ResizeObserver(measure);
    track.querySelectorAll(".tabbar-label").forEach((label) => ro.observe(label));
    return () => {
      cancelled = true;
      ro.disconnect();
    };
    // Labels are static text per key; only which keys are shown can change
    // (isPublic), not their wording, so that's the one real dependency.
  }, [isPublic]);

  const item = (tab: (typeof shown)[number]) => {
    const on = tab.key === active;
    const Icon = tab.icon;
    return (
      <button
        key={tab.key}
        type="button"
        className={`${tabbarItemClassName}${on ? " is-active" : ""}`}
        aria-current={on ? "page" : undefined}
        aria-label={tab.label}
        title={tab.label}
        onClick={() => onSelect(tab.key)}
      >
        <span className={tabbarIconClassName}>
          {tab.key === "profile" && viewer ? (
            viewer.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- a Supabase Storage URL, not one of the catalogue CDNs next/image is configured for.
              <img
                src={viewer.avatarUrl}
                alt=""
                width={20}
                height={20}
                className="w-5 h-5 shrink-0 aspect-square rounded-full object-cover border border-[var(--color-border-subtle)]"
              />
            ) : (
              <span
                className="grid place-items-center w-5 h-5 shrink-0 aspect-square rounded-full bg-[var(--color-bg-grouped)]
                  border border-[var(--color-border-subtle)] text-label-tertiary
                  [font-family:var(--font-main)] [font-size:9px] [font-weight:var(--fw-title)]"
                aria-hidden="true"
              >
                {viewer.name.charAt(0).toUpperCase()}
              </span>
            )
          ) : (
            <Icon {...ICON_SIZE} fill={on ? "currentColor" : "none"} aria-hidden="true" />
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
