"use client";

import { memo, useCallback, useDeferredValue, useMemo, useRef, useState, type CSSProperties, useEffect } from "react";
import { Search, X } from "lucide-react";
import Link from "next/link";
import Card from "./Card";
import Tag from "./Tag";
import CardAddDialog from "./CardAddDialog";
import PublicCardDialog from "./PublicCardDialog";
import CardsDashboard from "./CardsDashboard";
import CardsPokedex from "./CardsPokedex";
import CardsProfile from "./CardsProfile";
import CardsSidebar, { retryAsPng } from "./CardsSidebar";
import CardsTabBar, { type CardsTab } from "./CardsTabBar";
import FilterMenu, { type Facet } from "./FilterMenu";
import FilterSheet from "./FilterSheet";
import ViewSheet from "./ViewSheet";
import ViewMenu from "./ViewMenu";
import FilterChips, { type ActiveFilter } from "./FilterChips";
import { useCardsKey } from "../hooks/useCardsKey";
import { getCardsStats, tally } from "../../lib/core/cards-stats";
import { caught, getPokedex } from "../../lib/core/pokedex";
import { highScan, shownPrice } from "../../lib/core/cards";
import { type CardField, type DexOwned } from "./cards-fields";
import type { CardSet, OwnedCard } from "../../lib/core/cards";
import { LOCALE, OWNER_NAME } from "../../lib/core/config";
import { euro, euroWhole } from "../../lib/core/format";

/** "November 2024" from the ISO date TCGdex hands out, when it knows one. */
function releasedIn(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString(LOCALE, { month: "long", year: "numeric" });
}

/**
 * A Near Mint estimate, rounded to the euro, against a real price kept exact.
 *
 * The middle of the range is calibrated to within about 9% (see Price in
 * lib/cards.ts), so writing €54.30 would claim a precision it has never had.
 * Below €5 there is no range and the figure is Cardmarket's own, which is exact
 * and keeps its cents: the two are different kinds of number and the rounding
 * is the one visible clue which is which.
 */
const euroShown = (price: { market: number | null; nm: { mid: number } | null }) =>
  price.nm ? euroWhole(price.nm.mid) : price.market != null ? euro(price.market) : null;

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * The years an era actually spans in this collection, read off the sets rather
 * than written down. A hardcoded table would be a second source of truth that
 * quietly goes stale the first time a new set arrives.
 */
function eraYears(sets: CardSet[]) {
  const span = new Map<string, [number, number]>();
  for (const set of sets) {
    const year = set.releaseDate ? Number(set.releaseDate.slice(0, 4)) : NaN;
    if (Number.isNaN(year)) continue;
    for (const card of set.cards) {
      if (!card.gen) continue;
      const cur = span.get(card.gen);
      span.set(card.gen, cur ? [Math.min(cur[0], year), Math.max(cur[1], year)] : [year, year]);
    }
  }
  return span;
}

const label = (era: string, span: Map<string, [number, number]>) => {
  const y = span.get(era);
  if (!y) return era;
  return `${era} (${y[0] === y[1] ? y[0] : `${y[0]}–${y[1]}`})`;
};

/**
 * A card's scan and name, as a link when there is a page to link to.
 *
 * Not every row has one: a card TCGdex never matched has no id, and an id is
 * what the detail route is addressed by. Those keep the markup they always had
 * rather than becoming a dead anchor.
 */
function CardLink({
  id,
  onPick,
  children,
}: {
  id: string | null;
  /** Set on the public link, where a card has no URL to go to. */
  onPick?: () => void;
  children: React.ReactNode;
}) {
  if (!id) return <>{children}</>;
  if (onPick) {
    return (
      <button type="button" className="cards-item-link" onClick={onPick}>
        {children}
      </button>
    );
  }
  return (
    // scroll={false}, because this opens as a dialog over the page you are on.
    // The router scrolls to the top on a navigation, and it does it before the
    // dialog mounts: the grid behind the modal jumped to the first row, the
    // modal locked the page there, and closing it put you somewhere else than
    // where you clicked.
    <Link href={`/cards/${id}`} className="cards-item-link" scroll={false}>
      {children}
    </Link>
  );
}

/**
 * What a set amounts to: how much of it is held, and when it came out.
 *
 * "of N" only while the two agree. A Notion set name can cover several TCGdex
 * subsets, and `total` is the base set's official count, so a set built from
 * subsets read "170 of 86" and looked broken. Where the pair cannot be true,
 * the count that certainly is gets shown alone.
 */
function setMeta(set: CardSet) {
  const held =
    set.total && set.cards.length <= set.total
      ? `${set.cards.length} of ${set.total}`
      : `${set.cards.length} owned`;
  const when = releasedIn(set.releaseDate);
  return when ? `${held} · ${when}` : held;
}

/** How many sets are built at a time. See builtSets in CardsView. */
const SET_STEP = 6;

/**
 * How many cards fit across, per screen, and what it opens on.
 *
 * This was a pixel width on a slider, which is the honest unit for a grid built
 * on auto-fill and the wrong one to ask a reader for: nobody wants a scan 148px
 * wide, they want four across. So the control counts columns and the stylesheet
 * does the division.
 *
 * The two ranges are different because the columns are: a phone that fits six
 * would be drawing thumbnails, and a laptop stopped at four would be drawing
 * posters. The defaults are the middle of each, and switching between them is
 * what the effect below is for — a window dragged narrow should not keep a
 * count that only made sense wide.
 */
const COLS = {
  // One is a real answer on a phone: it is the "show me this card" view, and
  // the only width where a single column fills the screen with the artwork
  // rather than stranding it in a lane.
  narrow: { min: 1, max: 5, fallback: 3 },
  wide: { min: 3, max: 10, fallback: 6 },
} as const;

/**
 * The column count from which a scan gets the foil and the tilt.
 *
 * Not a taste threshold. poke-holo.css records what happened when that effect
 * was drawn small: at 113px the recipe read as vertical stripes over the
 * picture rather than as foil, because it is built for a card rendered three
 * times that wide.
 *
 * Six rather than five, which is the number the default was falling one short
 * of: a wide screen opens at six columns (COLS.wide.fallback) and the effect
 * was off at exactly that, so on a laptop nobody saw it at all unless they
 * went into View and asked for fewer. Measured on a 1400px window, six columns
 * draws a 164px card — half again the width the stripes argument is about — so
 * the reason for the limit does not reach this far. At ten it does, and ten is
 * still out.
 */
const TILT_UNDER = 6;

/** Vintage is the Wizards era. Decided on the sets' own dates, not a list. */
const VINTAGE_BEFORE = 2010;

/**
 * Which of the two this screen is.
 *
 * "owner" is /cards, behind the login: prices, what the collection is worth,
 * and the button that adds to it. "public" is /user/<name>, the link you hand
 * to someone: the same cards, the same filters, and nothing about money.
 *
 * The distinction is not enforced here. The public page strips every price out
 * of `sets` before this component ever sees them, so what this flag does is
 * take away the controls that would then be pointing at nothing — a Value facet
 * whose bands are all empty, a Priciest sort with nothing to sort by. Hiding is
 * done at the source; this is tidying up after it.
 */
export type CardsMode = "owner" | "public";

export default function CardsView({
  sets,
  signedIn = false,
  mode = "owner",
  username,
}: {
  sets: CardSet[];
  /** Read from the session cookie on the server, so the first paint is right. */
  signedIn?: boolean;
  mode?: CardsMode;
  /** Whose collection this is. Public only, and only to address its API by. */
  username?: string;
}) {
  const isPublic = mode === "public";
  /**
   * The card the public link has open, if any. Signed in this is a URL and an
   * intercepted route; here it is state, because /cards is behind middleware
   * and navigating there logs the visitor out of the page they were sent.
   */
  const [openCard, setOpenCard] = useState<{ card: OwnedCard; setName: string } | null>(null);
  const [query, setQuery] = useState("");
  // The list is well over a thousand items, so filtering runs against a
  // deferred copy of the query: typing stays responsive and the grid catches up
  // a frame later instead of every keystroke blocking on a full re-render.
  const deferred = useDeferredValue(query);

  /** "dashboard", "profile", "all", "wishlist", or a set name. The sets are
      navigation now, not a tick-box facet, so this is what narrows the page to
      one of them. */
  // The owner lands on the dashboard, which is the collection's front page.
  // The public link has no dashboard at all, so it opens on the cards, which is
  // the thing the link was shared to show.
  // The collection, in both modes. It used to be the dashboard when signed in,
  // which is the screen that summarises the cards rather than the cards: you
  // arrived at four numbers and a chart and pressed once more to reach what you
  // came for. The dashboard is still a slot in the bar and a row in the rail.
  const [selected, setSelected] = useState<string>("all");

  /**
   * Which of the two panes is showing, and only where there is room for one of
   * them: the rules that read this live inside the 1000px query, where the rail
   * already sits above the results rather than beside them.
   *
   * That stacked layout put a 420px list with its own scrollbar between you and
   * the page. A rail nobody can see past is not a rail, so on a narrow screen
   * the two panes take turns: the collection is the screen you land on, picking
   * something goes a level in, and the button at the top of the results comes
   * back out.
   *
   * You land on the results, not on the rail. /fifa opens the other way round
   * and that is not an inconsistency: there, the shelf of editions is the
   * subject and the songs are what one of them contains. Here the dashboard is
   * what the page is about, and landing on a list of fifty-one set names would
   * be opening a book on its table of contents. The rail is one press away and
   * says where you are the moment you get there.
   *
   * Undefined until something is pressed, which renders no attribute at all,
   * and that is the landing state for both the real page and the skeleton in
   * app/cards/loading.tsx: the stylesheet reads it as the results, which is why
   * its selector is written as :not([data-pane="rail"]). It also means the
   * pane-swap animation has nothing to match on the way in, so the dashboard
   * does not perform an arrival on every page load.
   *
   * State rather than a media query in JS, so the server and the first client
   * render agree and CSS alone decides whether any of it applies.
   */
  const [pane, setPane] = useState<"rail" | "main" | undefined>(undefined);

  /**
   * Where the rail was left, so coming back lands on the set you pressed rather
   * than at the top of fifty-one of them.
   *
   * Going in scrolls to the top, which is not a nicety: the rail is one long
   * column and the results replace it in the same scroll, so pressing a set
   * forty rows down opened it forty rows into its own grid. It reads as the
   * page having failed to navigate.
   */
  const railScroll = useRef(0);
  const openPane = useCallback(
    (value: string) => {
      // Only the rail's own scroll is worth remembering. The bar at the bottom
      // opens these same screens from the results, where this would store the
      // grid's scroll instead and coming back would land on a rail row nobody
      // pressed.
      if (pane === "rail") railScroll.current = window.scrollY;
      setSelected(value);
      setPane("main");
      window.scrollTo(0, 0);
    },
    [pane],
  );
  const backToRail = useCallback(() => {
    setPane("rail");
    // After the paint that swaps the panes, or there is nothing that tall to
    // scroll to yet and the browser clamps it to zero.
    requestAnimationFrame(() => window.scrollTo(0, railScroll.current));
  }, []);
  /**
   * Signing in and out, and the dialog the plus opens. The dialog lives here
   * rather than in the bar: it is opened from the toolbar above 1000px too,
   * where the bar is not on screen at all.
   *
   * `signedIn` is a prop rather than something this hook reports, because the
   * session is a cookie the server reads. That is what keeps the plus from
   * appearing a frame after everything else.
   */
  // Only signing out from here: the form that signs in owns that call itself,
  // so the key never passes through this component.
  const { signOut } = useCardsKey();
  const [adding, setAdding] = useState(false);

  const [pickedNames, setPickedNames] = useState<Set<string>>(new Set());
  const [pickedRarities, setPickedRarities] = useState<Set<string>>(new Set());
  const [pickedTypes, setPickedTypes] = useState<Set<string>>(new Set());
  const [pickedOwnership, setPickedOwnership] = useState<Set<string>>(new Set());
  const [pickedEras, setPickedEras] = useState<Set<string>>(new Set());
  const [pickedValues, setPickedValues] = useState<Set<string>>(new Set());
  const [view, setView] = useState<"grid" | "list">("grid");
  /**
   * How wide a scan is asked to be, in pixels, or null for whatever the
   * stylesheet decides.
   *
   * Null rather than 132 as the starting value, and that is the whole trick: the
   * grid's default column is a container query (132px, or 104 once the column is
   * narrow enough that 132 would fit only two per row), and an inline custom
   * property set on the list beats both. Starting at a number would hardcode the
   * desktop answer onto a phone before anyone had touched the control. So
   * nothing is written until the slider is moved, and from then on the reader's
   * answer is the one that holds at every width.
   */
  const [cols, setCols] = useState<number | null>(null);
  const [narrow, setNarrow] = useState(false);

  // Which of the two ranges applies. 640 is where the rail stops being a column
  // beside the cards, which is the same place the grid stops having room for a
  // wide count.
  useEffect(() => {
    const q = window.matchMedia("(max-width: 640px)");
    const read = () => setNarrow(q.matches);
    read();
    q.addEventListener("change", read);
    return () => q.removeEventListener("change", read);
  }, []);

  const range = narrow ? COLS.narrow : COLS.wide;
  // Clamped rather than remembered across the breakpoint: eight columns chosen
  // on a laptop is not an answer a phone can honour, and silently keeping it
  // would draw eight thumbnails 40px wide.
  const shownCols = Math.min(Math.max(cols ?? range.fallback, range.min), range.max);
  // Scans and logos whose file is not actually there. TCGdex publishes the
  // record before the artwork, so a URL alone is not proof of an image.
  const [brokenScans, setBrokenScans] = useState<Set<string>>(new Set());
  const [brokenLogos, setBrokenLogos] = useState<Set<string>>(new Set());
  // Sets whose artwork is not uploaded at all, learnt from the first card of
  // that set that failed both attempts. A working scan carries a month of
  // cache-control and comes off the edge; the 404 of a set that has no scans
  // yet carries no cache header at all, so every request travels back to
  // TCGdex' origin and takes seconds. Two of those per card, times a full set,
  // is the difference between a page that loads and one that hangs. One slow
  // failure buys the whole set its empty slots.
  const [brokenSets, setBrokenSets] = useState<Set<string>>(new Set());
  // One callback for every scan that gives up, defined once. A fresh function
  // per card would be a new prop on all 1,622 items and would defeat the memo
  // on CardItem entirely.
  const onScanBroken = useCallback((cardKey: string, setName: string) => {
    setBrokenScans((b) => new Set(b).add(cardKey));
    setBrokenSets((b) => new Set(b).add(setName));
  }, []);
  // "set" is the collection's own order, which is what the page has always
  // shown: by set, newest first, numbered within it. The other two reorder the
  // cards inside each set rather than flattening the whole thing, so a sorted
  // page is still a page of sets and you can still see what came from where.
  const [sort, setSort] = useState<"set" | "value" | "value-asc">("set");

  /**
   * How the same list is laid out: as the sets it came in, or against the
   * Pokédex.
   *
   * The dex used to be a destination of its own, with its own era control, its
   * own ownership dropdown and its own search placeholder. That made it a
   * second app beside the collection: the filters you had set did not follow
   * you into it, and the ones inside it did not come back out. It is a way of
   * arranging the cards you are already looking at, so it is a view option.
   *
   * What it keeps is the one thing that is genuinely about the dex rather than
   * about the cards: which printing stands for a Pokémon. See dexSets.
   */
  const [group, setGroup] = useState<"set" | "flat" | "year" | "dex">("flat");

  /**
   * Which facts a tile carries under its scan.
   *
   * The tile used to show a fixed five: name, number, type, price and a tag per
   * printing. That is right for browsing and wrong for the two other things
   * this page is used for — checking a set against its numbers, where the name
   * is noise, and looking at the artwork, where all of it is. So it is a
   * setting, and it lives beside grouping and size because it is the same kind
   * of question: how much of the card do you want to see.
   *
   * Name is not in here. A tile with no name is a picture of a card you cannot
   * search for by eye, and every other field is a detail about it.
   */
  const [fields, setFields] = useState<Set<CardField>>(
    () => new Set<CardField>(["number", "type", "price", "rarity"]),
  );
  // A layout of the list, not a place, so it is off wherever there is no list:
  // the dashboard summarises the collection and the profile is about the
  // password. Read off `selected` rather than the onDashboard/onProfile flags
  // further down, because the facets above need it before those exist.
  const onPokedex = group === "dex" && selected !== "dashboard" && selected !== "profile";
  /**
   * One run of cards with nothing between them.
   *
   * The default, and by set is one press away. A set heading every twelve cards
   * is a lot of furniture on the screen you land on: the rail already lists the
   * sets and names the one you are in, so the headings were repeating the
   * navigation down the middle of the page. It also answers the question you
   * usually arrive with — how much of something is there — without counting
   * across eight headings for the nine Charizards in seven sets.
   */
  const onFlat = group === "flat" && selected !== "dashboard" && selected !== "profile";
  const onYear = group === "year" && selected !== "dashboard" && selected !== "profile";

  const all = useMemo(() => sets.flatMap((s) => s.cards), [sets]);
  const total = all.length;
  const wishlist = useMemo(() => all.filter((c) => !c.owned).length, [all]);
  const years = useMemo(() => eraYears(sets), [sets]);

  /**
   * Held and wanted, as two lists rather than one with a tick box.
   *
   * The Notion database is a single list and ownership is a checkbox on the
   * row, which is why this used to be a facet: "In the binder" or "On the
   * wishlist", off by default, so the page opened on both at once. Thirty-three
   * cards you do not own were mixed into a grid of sixteen hundred you do, and
   * the only thing telling them apart was a dimmed scan.
   *
   * They answer different questions. One is what you have; the other is what to
   * buy. So they are two destinations in the rail, and every list view below is
   * scoped to whichever one you are in. `sets` itself stays whole, because the
   * dashboard counts both and the Pokédex deliberately shows them together.
   */
  // Declared up here rather than beside onDashboard and the rest further down,
  // because the scoping below is the first thing that needs it.
  const onWishlist = selected === "wishlist";
  const collectionSets = useMemo(
    () =>
      sets
        .map((s) => ({ ...s, cards: s.cards.filter((c) => c.owned) }))
        .filter((s) => s.cards.length > 0),
    [sets],
  );
  const wishlistSets = useMemo(
    () =>
      sets
        .map((s) => ({ ...s, cards: s.cards.filter((c) => !c.owned) }))
        .filter((s) => s.cards.length > 0),
    [sets],
  );

  /** Which eras count as vintage, from the earliest set each one appears in. */
  const vintageEras = useMemo(() => {
    const out = new Set<string>();
    for (const [gen, [from]] of years) if (from < VINTAGE_BEFORE) out.add(gen);
    return out;
  }, [years]);

  // Built from the whole collection rather than from what is currently shown,
  // so the lists do not shuffle and shrink underneath the pointer as boxes are
  // ticked. The count beside each option is the collection total.
  const nameOptions = useMemo(() => tally(all.map((c) => c.name)), [all]);
  const rarityOptions = useMemo(
    () => tally(all.flatMap((c) => c.variants.map((v) => v.rarity))),
    [all],
  );
  const typeOptions = useMemo(() => tally(all.map((c) => c.type)), [all]);
  // Bands rather than a slider: a slider over a range this skewed (a €5.68
  // median under a €3,250 top card) spends nine tenths of its travel on the
  // last twenty cards. The edges are round numbers a collector already thinks
  // in.
  const VALUE_BANDS = useMemo(
    () =>
      [
        { value: "Under €5", test: (n: number) => n < 5 },
        { value: "€5 – €25", test: (n: number) => n >= 5 && n < 25 },
        { value: "€25 – €100", test: (n: number) => n >= 25 && n < 100 },
        { value: "€100 and up", test: (n: number) => n >= 100 },
      ] as const,
    [],
  );
  const valueOptions = useMemo(
    () =>
      VALUE_BANDS.map((b) => ({
        value: b.value,
        count: all.filter((c) => {
          const n = shownPrice(c.price);
          return n != null && b.test(n);
        }).length,
      })).filter((o) => o.count > 0),
    [all, VALUE_BANDS],
  );

  /**
   * Held or wanted, as a tick box. Now empty on every screen that has one.
   *
   * Since the two became separate destinations, every list is already one or
   * the other, so this facet can only offer the option you are looking at.
   * Counted against the scoped list rather than the whole database, which drops
   * it to a single option, and the guard further down (`length > 1`) then takes
   * the control out of the menu on its own. Kept rather than deleted because it
   * earns its place again the moment there is a screen showing both.
   */
  const ownershipOptions = useMemo(
    () =>
      [
        { value: "In the binder", count: onWishlist ? 0 : total - wishlist },
        { value: "On the wishlist", count: onWishlist ? wishlist : 0 },
        // The gaps, which only the dex draws: a Pokémon you hold no card of is
        // not a row in the collection, it is an empty slot on a shelf of 1,025.
        { value: "Not owned", count: onPokedex ? 1 : 0 },
      ].filter((o) => o.count > 0),
    [onWishlist, onPokedex, total, wishlist],
  );

  /**
   * The sets, grouped under the era they belong to.
   *
   * A set does not record an era; its cards do. So the era of a set is the one
   * most of its cards carry, which handles the promo sets that mix a couple of
   * strays in without letting those strays move the whole set. Ordered oldest
   * era first, the way a binder runs, with anything unlabelled at the back.
   */
  const setGroups = useMemo(() => {
    const groups = new Map<string, CardSet[]>();
    // The rail lists the collection, so a set is only in it once something from
    // it is actually held. Three sets here are wishlist-only (Team Up, Unbroken
    // Bonds, Unified Minds); before this they sat in the rail reading "0" and
    // opened onto nothing, which looks like a set that failed to load rather
    // than one that has not been started. They are still reachable, under
    // Wishlist, which is where a card you do not own belongs.
    for (const set of collectionSets) {
      const counts = new Map<string, number>();
      for (const card of set.cards) {
        if (card.gen) counts.set(card.gen, (counts.get(card.gen) ?? 0) + 1);
      }
      const era = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Other";
      groups.set(era, [...(groups.get(era) ?? []), set]);
    }
    return (
      [...groups.entries()]
        .map(([era, inEra]) => ({
          era,
          label: label(era, years),
          // Newest set first inside the era, which is the order a collection is
          // actually browsed: the last pack you opened is the one you want.
          sets: [...inEra].sort((a, b) =>
            (b.releaseDate ?? "").localeCompare(a.releaseDate ?? "", LOCALE),
          ),
        }))
        // Newest era first, for the same reason. Anything unlabelled sorts last.
        .sort((a, b) => (years.get(b.era)?.[1] ?? -Infinity) - (years.get(a.era)?.[1] ?? -Infinity))
    );
  }, [collectionSets, years]);

  /**
   * The toolbar sits above the dashboard as well as above the results, so
   * reaching for it has to mean something there. Narrowing the collection while
   * looking at the summary moves you to the cards, which is where the answer
   * is: the dashboard reads the whole collection by definition and would sit
   * there unchanged while the bar said four filters were on.
   */
  const leaveDashboard = useCallback(() => setSelected((s) => (s === "dashboard" ? "all" : s)), []);

  const toggle = useCallback(
    (setter: React.Dispatch<React.SetStateAction<Set<string>>>) => (value: string) => {
      leaveDashboard();
      setter((prev) => {
        const next = new Set(prev);
        if (!next.delete(value)) next.add(value);
        return next;
      });
    },
    [leaveDashboard],
  );

  const picked = [pickedNames, pickedRarities, pickedTypes, pickedOwnership, pickedValues, pickedEras];
  const active = picked.some((s) => s.size > 0) || query.trim() !== "";

  const reset = useCallback(() => {
    setQuery("");
    setPickedNames(new Set());
    setPickedRarities(new Set());
    setPickedTypes(new Set());
    setPickedOwnership(new Set());
    setPickedValues(new Set());
    setPickedEras(new Set());
  }, []);

  const matchesValue = useCallback(
    (c: OwnedCard) => {
      if (!pickedValues.size) return true;
      const n = shownPrice(c.price);
      // A card with no price cannot be in a band. It is not worth nothing, it
      // is unknown, and putting it in "under €5" would be inventing a fact.
      if (n == null) return false;
      return VALUE_BANDS.some((b) => pickedValues.has(b.value) && b.test(n));
    },
    [pickedValues, VALUE_BANDS],
  );

  const matchesOwnership = useCallback(
    (c: OwnedCard) =>
      !pickedOwnership.size ||
      (pickedOwnership.has("In the binder") && c.owned) ||
      (pickedOwnership.has("On the wishlist") && !c.owned),
    [pickedOwnership],
  );

  const filtered = useMemo(() => {
    const q = norm(deferred.trim());
    // Wishlist is the one screen that runs over the cards you do not hold; the
    // sets, the eras and My collection are all the ones you do. Scoped here, at
    // the source, rather than as one more condition inside the card filter, so
    // there is no view left where the two can be mixed by accident.
    const scope = onWishlist ? wishlistSets : collectionSets;
    return scope
      .map((set) => {
        // "era:Base" keeps every set that holds a card from it; the cards
        // themselves are narrowed below. A plain set name keeps just that set.
        if (selected.startsWith("era:")) {
          const want = selected.slice(4);
          if (!set.cards.some((c) => c.gen === want)) return null;
        } else if (
          selected !== "all" &&
          selected !== "wishlist" &&
          selected !== "dashboard" &&
          set.name !== selected
        ) {
          return null;
        }
        // A set whose name matches the search keeps all of its cards: typing
        // "surging" is asking for the set, not for cards with that word in
        // them. The tick boxes still apply on top of it.
        const bySetName = q !== "" && norm(set.name).includes(q);
        const cards = set.cards.filter((c) => {
          if (selected.startsWith("era:") && c.gen !== selected.slice(4)) return false;
          // Vintage or modern, decided by the set's own release date rather
          // than by a list kept by hand. See vintageEras.
          if (pickedEras.size) {
            const isVintage = c.gen ? vintageEras.has(c.gen) : false;
            if (!pickedEras.has(isVintage ? "Vintage" : "Modern")) return false;
          }
          if (pickedNames.size && !pickedNames.has(c.name)) return false;
          if (pickedTypes.size && !pickedTypes.has(c.type ?? "")) return false;
          if (!matchesOwnership(c)) return false;
          if (!matchesValue(c)) return false;
          if (pickedRarities.size && !c.variants.some((v) => pickedRarities.has(v.rarity ?? "")))
            return false;
          if (!q || bySetName) return true;
          return (
            norm(c.name).includes(q) ||
            norm(c.number).includes(q) ||
            norm(c.type ?? "").includes(q) ||
            norm(c.gen ?? "").includes(q) ||
            c.variants.some((v) => norm(v.rarity ?? "").includes(q))
          );
        });
        if (!cards.length) return null;
        // Sorted within the set, not across the collection: the page is a
        // shelf of sets and flattening it would throw away the one thing the
        // grouping tells you. A card with no price sorts last either way,
        // unknown is not the cheapest.
        const ordered =
          sort === "set"
            ? cards
            : [...cards].sort((a, b) => {
                const x = shownPrice(a.price);
                const y = shownPrice(b.price);
                if (x === null && y === null) return 0;
                if (x === null) return 1;
                if (y === null) return -1;
                return sort === "value" ? y - x : x - y;
              });
        return { ...set, cards: ordered };
      })
      .filter(Boolean) as CardSet[];
  }, [
    onWishlist,
    collectionSets,
    wishlistSets,
    deferred,
    selected,
    vintageEras,
    pickedEras,
    pickedNames,
    pickedRarities,
    pickedTypes,
    matchesOwnership,
    matchesValue,
    sort,
  ]);

  const shown = useMemo(() => filtered.reduce((n, set) => n + set.cards.length, 0), [filtered]);

  /**
   * The same cards under the year their set came out, newest first.
   *
   * Grouped on the set's release date rather than on the card's era, which is
   * the other date this collection knows: an era spans years and answers "which
   * generation", while this answers "when did I get to open these", which is
   * the question a shelf sorted by time is actually asked. A set with no date
   * at TCGdex lands under Undated rather than under a guess.
   */
  const yearGroups = useMemo(() => {
    if (!onYear) return [];
    const by = new Map<string, CardSet>();
    for (const set of filtered) {
      const year = set.releaseDate?.slice(0, 4) ?? "Undated";
      const at = by.get(year);
      if (at) at.cards.push(...set.cards);
      else by.set(year, { ...set, name: year, logo: null, logoSize: null, total: null, cards: [...set.cards] });
    }
    return [...by.values()].sort((a, b) => b.name.localeCompare(a.name));
  }, [onYear, filtered]);

  /**
   * Every card on screen in the order it is drawn, so the dialog's arrows and
   * its swipe follow what you were looking at rather than the collection's own
   * order. That is the difference between here and the signed-in route: this
   * dialog has no URL, so it can afford to answer to the page's state.
   *
   * Only built where it is used, which is the public link with a card open.
   */
  const flatCards = useMemo(
    () =>
      !isPublic || !openCard
        ? []
        : filtered.flatMap((set) => set.cards.map((card) => ({ card, setName: set.name }))),
    [isPublic, openCard, filtered],
  );
  const openIndex = openCard ? flatCards.findIndex((c) => c.card.key === openCard.card.key) : -1;

  /**
   * How many of the matching sets are actually built, and why the page does not
   * build all of them.
   *
   * "All cards" is 1,622 items of about twelve nodes each. Rendering them in one
   * commit was 19,288 DOM nodes and a 436ms long task at 4x CPU throttling,
   * which is the freeze between pressing "All cards" and seeing anything. The
   * grid already carries `content-visibility: auto` (cards.css), so the browser
   * was skipping the layout and paint of everything below the fold; what it
   * cannot skip is React creating the elements and the nodes in the first place.
   * That is the half this fixes.
   *
   * Whole sets rather than a window of rows, because the page is already a stack
   * of sets and a set is the unit that has a heading, a logo and its own grid.
   * Slicing inside one would mean reserving the height of a grid whose column
   * count is a container query, and guessing it wrong is a scroll that jumps
   * under the reader. Slicing between them needs no reservation at all: what has
   * not been built yet is simply below what has.
   *
   * The cost is that find-in-page only reaches what has been built. That is the
   * honest trade for the freeze, and this page has a search box of its own which
   * looks through all 1,622 whatever is on screen.
   */
  /**
   * How many groups are built to begin with.
   *
   * Six behind the login, which is the point of the incremental build: a
   * thousand-odd tiles is a second of blocked main thread, and nobody scrolls
   * that far before the observer has caught up.
   *
   * All of them on the public link, and that is the one page where the trade
   * goes the other way. It is the only indexed page in the app, and a crawler
   * does not scroll — six sets meant 91 of 1,645 cards were the entire page as
   * far as a search engine was concerned. The cost is paid once, in prerender,
   * because that route is static.
   */
  const initialSets = isPublic ? Number.MAX_SAFE_INTEGER : SET_STEP;
  const [builtSets, setBuiltSets] = useState(initialSets);
  /**
   * Back to the first few whenever the answer changes. Without this, narrowing a
   * search kept whatever count the last scroll had grown to, so a query matching
   * three sets would still build fifty.
   *
   * During the render rather than in an effect, which is what React asks for
   * when state has to follow its input: an effect would commit the long list
   * first and the short one a pass later, so every search would build the old
   * count before throwing it away. Comparing the array by identity is enough
   * here because `filtered` is a useMemo, so it is a new array exactly when what
   * it holds has changed.
   */
  const [builtFor, setBuiltFor] = useState(filtered);
  /**
   * Bumped on every reset and every batch, and it is what the marker below is
   * keyed on. See the note there: it has to be a value that changes even when
   * the count does not, because resetting six back to six is the case that
   * silently stopped the whole thing.
   */
  const [generation, setGeneration] = useState(0);
  if (builtFor !== filtered) {
    setBuiltFor(filtered);
    setBuiltSets(initialSets);
    setGeneration((g) => g + 1);
  }
  // Years or sets, whichever the page is grouped by. Both are CardSet[] on
  // purpose: a year is a set of cards with a name and no logo, so everything
  // that draws a section keeps working without knowing which it is looking at.
  const grouped = onYear ? yearGroups : filtered;
  const visibleSets = useMemo(
    () => grouped.slice(0, builtFor === filtered ? builtSets : initialSets),
    [grouped, filtered, builtFor, builtSets, initialSets],
  );

  /**
   * The marker under the last built set. Reaching it builds the next few.
   *
   * 800px of rootMargin so the next sets exist before they are scrolled to: at a
   * normal reading scroll that is far enough ahead that nothing is ever waited
   * for, and it is why this is not a spinner.
   *
   * A callback ref rather than a useRef read inside an effect, and that is the
   * whole reason it works. The marker does not exist on the screen you land on:
   * the dashboard renders instead of the list, so a useRef is still null when
   * the effect first runs. Pressing "All cards" mounts the marker but changes
   * neither of the values such an effect could sensibly depend on, so it never
   * runs again and nothing is ever observed. React calls a callback ref exactly
   * when the node appears and again with null when it goes, which is the event
   * this needs.
   */
  const observer = useRef<IntersectionObserver | null>(null);
  const moreRef = useCallback((node: HTMLDivElement | null) => {
    observer.current?.disconnect();
    if (!node) return;
    observer.current = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        setBuiltSets((n) => n + SET_STEP);
        setGeneration((g) => g + 1);
      },
      { rootMargin: "800px" },
    );
    observer.current.observe(node);
  }, []);
  const hasMore = builtSets < filtered.length;

  // The dashboard reads the whole collection, not what is filtered: it is the
  // page's answer to "what is in here", and a total that moved every time a box
  // was ticked would be answering a different question.
  // Only the dashboard reads these, and the public link has no dashboard, so
  // the walk over sixteen hundred cards is skipped rather than thrown away.
  const stats = useMemo(() => (isPublic ? null : getCardsStats(sets)), [isPublic, sets]);

  /**
   * Vintage and modern, as a facet rather than as three buttons in the bar.
   *
   * It was a segmented control beside the search, and it came out because the
   * rail already groups the sets under their era: two controls for one idea,
   * and one of them permanently on screen. As a tick box it costs nothing when
   * it is not being used and it lands in the same place every other narrowing
   * does, including the chips that say what is on.
   *
   * Which eras count as vintage is read off the sets' own release dates (see
   * vintageEras), so this stays a list of two and never a list of eras.
   */
  const eraOptions = useMemo(() => {
    const vintage = all.filter((c) => (c.gen ? vintageEras.has(c.gen) : false)).length;
    return [
      { value: "Vintage", count: vintage },
      { value: "Modern", count: all.length - vintage },
    ].filter((o) => o.count > 0);
  }, [all, vintageEras]);

  const facets = useMemo(
    (): Facet[] => [
      {
        key: "name",
        label: "Pokémon",
        options: nameOptions,
        selected: pickedNames,
        onToggle: toggle(setPickedNames),
        onClear: () => setPickedNames(new Set()),
        onReplace: (next: Set<string>) => setPickedNames(next),
      },
      {
        key: "era",
        label: "Era",
        options: eraOptions,
        selected: pickedEras,
        onToggle: toggle(setPickedEras),
        onClear: () => setPickedEras(new Set()),
        onReplace: (next: Set<string>) => setPickedEras(next),
      },
      {
        key: "rarity",
        label: "Rarity",
        options: rarityOptions,
        selected: pickedRarities,
        onToggle: toggle(setPickedRarities),
        onClear: () => setPickedRarities(new Set()),
        onReplace: (next: Set<string>) => setPickedRarities(next),
      },
      // Not on the public link. The bands are labelled in euros ("Under €5",
      // "€100 and up"), so the facet says what a collection is worth even with
      // every price stripped out of the cards themselves.
      ...(isPublic
        ? []
        : [
            {
              key: "value",
              label: "Value",
              options: valueOptions,
              selected: pickedValues,
              onToggle: toggle(setPickedValues),
              onClear: () => setPickedValues(new Set()),
              onReplace: (next: Set<string>) => setPickedValues(next),
            },
          ]),
      {
        key: "type",
        label: "Type",
        options: typeOptions,
        selected: pickedTypes,
        onToggle: toggle(setPickedTypes),
        onClear: () => setPickedTypes(new Set()),
        onReplace: (next: Set<string>) => setPickedTypes(next),
      },
      ...(ownershipOptions.length > 1
        ? [
            {
              key: "owned",
              label: "Owned",
              options: ownershipOptions,
              selected: pickedOwnership,
              onToggle: toggle(setPickedOwnership),
              onClear: () => setPickedOwnership(new Set()),
              onReplace: (next: Set<string>) => setPickedOwnership(next),
            },
          ]
        : []),
    ],
    [
      isPublic,
      nameOptions,
      rarityOptions,
      typeOptions,
      ownershipOptions,
      valueOptions,
      eraOptions,
      pickedEras,
      pickedValues,
      pickedNames,
      pickedRarities,
      pickedTypes,
      pickedOwnership,
      toggle,
    ],
  );

  /** Every tick that is on, flattened, so the bar can list and undo them. */
  const activeFilters = useMemo((): ActiveFilter[] => {
    const groups: [string, Set<string>, React.Dispatch<React.SetStateAction<Set<string>>>][] = [
      ["Pokémon", pickedNames, setPickedNames],
      ["Rarity", pickedRarities, setPickedRarities],
      ["Type", pickedTypes, setPickedTypes],
      ["Ownership", pickedOwnership, setPickedOwnership],
      ["Era", pickedEras, setPickedEras],
    ];
    const out = groups.flatMap(([group, set, setter]) =>
      [...set].map((value) => ({
        group,
        value,
        onRemove: () =>
          setter((prev) => {
            const next = new Set(prev);
            next.delete(value);
            return next;
          }),
      })),
    );
    if (query.trim()) {
      out.unshift({ group: "Search", value: `“${query.trim()}”`, onRemove: () => setQuery("") });
    }
    return out;
  }, [query, pickedNames, pickedRarities, pickedTypes, pickedOwnership, pickedEras]);

  // Never on the public link, which has no dashboard to be on. Guarded here
  // rather than trusting the initial state: `selected` is also written by the
  // bar, the rail and the search, and one of them forgetting would land someone
  // on a screen that does not exist there.
  const MainTitle = isPublic ? "h1" : "h2";
  const onDashboard = selected === "dashboard" && !isPublic;
  /** The set the page is on, when it is on one: its logo and its facts head the
      page rather than being repeated over the grid below. */
  const currentSet = useMemo(() => sets.find((s) => s.name === selected) ?? null, [sets, selected]);
  const onProfile = selected === "profile" && !isPublic;
  // Whose it is. On the link you hand to somebody else it is not theirs.
  const collectionName = isPublic ? `${OWNER_NAME}'s collection` : "My collection";

  /**
   * The dex's own ownership control, read off the collection's Owned facet.
   *
   * It used to be a dropdown of four beside the shelf, which meant the tick you
   * had already made in Filter did not follow you in. One facet answers both
   * now. "Not owned" only exists here, because a card you do not have is not in
   * the collection at all and only the dex has a slot to leave empty for it;
   * ownershipOptions offers it exactly where it means something.
   */
  const dexOwned: DexOwned =
    pickedOwnership.size !== 1
      ? "all"
      : pickedOwnership.has("Not owned")
        ? "missing"
        : pickedOwnership.has("On the wishlist")
          ? "wishlist"
          : "owned";

  /**
   * Which slot in the bar is lit, which is not quite the same question as which
   * screen is up: on the rail nothing else is, and a set is a leaf of Sets
   * rather than a destination of its own. Null on the results of a filter or a
   * search, where the answer is honestly none of the four.
   */
  const activeTab: CardsTab | null =
    pane === "rail" || currentSet || selected.startsWith("era:")
      ? "sets"
      : onDashboard
        ? "dashboard"
        : // Searching is a state rather than a place: the slot is lit while
            // there is something in the field, and goes out when it is cleared.
            // The profile has no slot at all and so lights none.
            query.trim() && !isPublic
            ? "search"
            : // Only where the bar carries them. Signed in these two are rail
              // rows with no slot to light, and pointing the pill at a slot
              // that is not there leaves it parked on whatever was last. The
              // same reason the search test above is owner-only.
              isPublic && onWishlist
              ? "wishlist"
              : isPublic && selected === "all"
                ? "collection"
                : null;

  /**
   * The search field in the toolbar, so the bar's Search slot can put the caret
   * in it. Only ever one field is on screen (the other is the rail's), and
   * below 1000px, where the bar exists, this is the one.
   */
  const searchRef = useRef<HTMLInputElement>(null);
  const openSearch = useCallback(() => {
    // To the cards, because that is where a search is answered: pressing this
    // on the dashboard and being left on the dashboard with a caret blinking
    // is the field appearing to do nothing.
    setSelected((s) => (s === "dashboard" || s === "profile" ? "all" : s));
    setPane("main");
    // After the paint that swaps the screens, or the field is not there yet.
    requestAnimationFrame(() => searchRef.current?.focus());
  }, []);

  /**
   * Every Pokémon there is, with the collection filed into it. Built here rather
   * than on the server so the payload carries the cards once: the dex is the
   * same nineteen hundred rows, grouped a different way.
   *
   * Its own era rather than the toolbar's, and modern to begin with. A Pokédex
   * of the whole binder is mostly answered by the vintage cards, which are the
   * ones that cover the first hundred and fifty and nothing after them, so the
   * default view of it was a page of Kanto and a thousand empty slots. Modern
   * is the collection as it actually is. The switch is right there to widen it,
   * and it stays out of the era the card lists use, which the rail already
   * decides.
   */
  /**
   * All 1,025, or one of the three things a slot can be.
   *
   * "Have" used to mean "there is a card", which folded two different states
   * together: a card in the binder and a card on the wishlist are both rows in
   * Notion, and only one of them is something you own. The dex was answering
   * "do you have a Beedrill" with yes for a Beedrill Bart wants.
   */
  /**
   * The dex, built from whatever the filters have left rather than from the
   * whole database. That is the point of it being a view: tick Charizard, or
   * Fire, or a set in the rail, and the shelf answers with those.
   *
   * The one rule it keeps for itself is which printing represents a Pokémon.
   * Vintage is the Wizards sets, which have no illustration rares at all, so
   * filtering for them there empties the shelf; modern has thousands of cards
   * whose ordinary printings all look alike, and a dex filled by whichever copy
   * was read first is a wall of commons. Applied per card rather than per page,
   * which is the only way one list can hold both without lying about either.
   */
  const dex = useMemo(
    () =>
      getPokedex(
        filtered.map((set) => ({
          ...set,
          cards: set.cards.filter((c) => {
            const isVintage = c.gen ? vintageEras.has(c.gen) : false;
            if (isVintage) return true;
            // Both the Illustration Rares and the Special ones, which is what
            // the one word they share is doing here.
            return c.variants.some((v) => /illustration rare/i.test(v.rarity ?? ""));
          }),
        })),
      ),
    [filtered, vintageEras],
  );

  /**
   * Vintage stops at Mew.
   *
   * The dex is 1,025 slots and the Wizards era could only ever fill the first
   * 151 of them, so the other 874 are not gaps in the collection, they are
   * Pokémon that did not exist yet. Drawing them as empty slots says something
   * untrue about the binder, at eighty-five percent of the page.
   */
  // Vintage stops at Mew: the Wizards sets never printed anything after 151, so
  // the other 874 slots are a certainty rather than a gap worth drawing.
  const dexShown = useMemo(
    () => (pickedEras.size === 1 && pickedEras.has("Vintage") ? dex.slice(0, 151) : dex),
    [dex, pickedEras],
  );

  return (
    <>
      {/* The page's heading, outside both panes because either of them can be
          the one on screen: it sat in .cards-main, which is display:none on the
          rail, so the screen you were on could have no h1 at all. Absolutely
          positioned by .sr-only, so it is not a third column in the grid.

          Out of sight rather than out of the document, the same call /fifa
          makes: what you can see already says which page this is, twice over,
          and a title over both panes would be a third thing saying it. */}
      {/* Owner side only. On the public link the visible title below is the h1
          instead: that page is indexed, and an h1 reading "Cards" on a page
          titled "<name>'s Pokémon card collection" is the heading disagreeing
          with the title about what the page is. Here there is nothing to
          disagree with — the tab says binder and the screen says Cards. */}
      {!isPublic && <h1 className="sr-only">Cards</h1>}

      <CardsSidebar
        sets={sets}
        setGroups={setGroups}
        selected={selected}
        pane={pane}
        onSelect={openPane}
        signedIn={signedIn && !isPublic}
        isPublic={isPublic}
        onAdd={() => setAdding(true)}
        brokenLogos={brokenLogos}
        onBrokenLogo={(name) => setBrokenLogos((prev) => new Set(prev).add(name))}
      />

      <section className="cards-main">
        {/* The page's own heading, over the pane it names. It used to sit at the
            top of the rail, which put the h1 over a list of sets rather than
            over what you are actually reading. */}
        <header className="cards-head">
          <div className="cards-head-title">
            {/* The set's own wordmark, ahead of its name. */}
            {currentSet?.logo && !brokenLogos.has(currentSet.name) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={currentSet.logo}
                alt=""
                className="cards-head-logo"
                width={currentSet.logoSize?.width}
                height={currentSet.logoSize?.height}
                decoding="async"
                onError={(e) =>
                  retryAsPng(e.currentTarget, () =>
                    setBrokenLogos((b) => new Set(b).add(currentSet.name)),
                  )
                }
              />
            )}
            {/* An h2 under the rail's h1, not the page's own heading. What it
                says is which part of the collection is on screen, and it
                changes with the rail; the page is called Cards whatever it
                says. It also could not stay the h1: below 1000px it is one of
                two screens and the other one then had no heading at all. */}
            {/* The screen's own name, not the page's. It said "Cards" over the
                dashboard, which is the one heading here that named the route
                instead of what is under it: the sr-only h1 already says Cards
                and it is in the document whichever pane is up. */}
            {/* The screen, not the layout. It used to say "Pokédex" when the
                dex was a destination; now that it is a way of arranging the
                cards, saying it here would replace the name of the thing you
                are actually looking at — the collection, the wishlist, or one
                set — with the name of a control. */}
            {/* An h1 on the public link and an h2 behind the login. The
                indexed page needs exactly one top-level heading and this is
                the only thing on it that names the collection; the owner side
                already has one in the sr-only line above.

                The trade, stated: below 1000px the rail is a screen of its own
                and .cards-main is hidden, so a public visitor looking at the
                list of sets is on a screen whose h1 is not rendered. A crawler
                is never in that state, and the rail is one press from the
                screen that has it. */}
            <MainTitle className="cards-main-title">
              {onDashboard
                ? "Dashboard"
                : onProfile
                  ? "Profile"
                  : onWishlist
                    ? "Wishlist"
                    : selected === "all"
                      ? collectionName
                      : selected.startsWith("era:")
                        ? label(selected.slice(4), years)
                        : selected}
            </MainTitle>
          </div>
          {/* What you are looking at, in numbers, announced politely so it
              reaches a screen reader as it changes rather than only being
              visible. It used to report the collection total under every
              heading, so a set of twelve cards was captioned "1,622 cards
              across 51 sets". */}
          {/* Not on the profile: that screen is about the key, and a count of
              the collection under it would be answering a question nobody on it
              is asking. */}
          {total > 0 && !onProfile && (
            <p className="cards-count" role="status">
              {onPokedex
                ? `${caught(dexShown).toLocaleString(LOCALE)} of ${dexShown.length.toLocaleString(LOCALE)} Pokémon in the binder`
                : /* The dashboard is the one screen that speaks for the whole
                     database, held and wanted together. Everywhere else the
                     count comes from what is actually on the page, which since
                     the split is either the collection or the wishlist and
                     never both; "1,645 across 52 sets" over a grid of 1,612
                     was the old line describing a page that no longer exists. */
                  onDashboard
                  ? `${total.toLocaleString(LOCALE)} cards across ${sets.length} sets`
                  : currentSet && !active
                    ? setMeta(currentSet)
                    : filtered.length === 1
                      ? `${shown.toLocaleString(LOCALE)} ${shown === 1 ? "card" : "cards"}`
                      : `${shown.toLocaleString(LOCALE)} cards across ${filtered.length} sets`}
            </p>
          )}

          {/* Everything that narrows the collection, in one row above it, and
              only above the screens where there is something to narrow.

              It used to stand over the dashboard and the profile too, on the
              argument that a search box you can only reach by navigating away
              from the page you land on is a search box nobody finds. That
              argument was right and it is answered rather than ignored: the
              search has moved to the head of the rail above 1000px, where it is
              on screen without going anywhere, and to a slot of its own in the
              bar below it. Neither is a place you have to find. What is left
              here is filtering, sorting and layout, which are answers about a
              list of cards and mean nothing over a summary or a key. */}
          {!onProfile && !onDashboard && (
            <div className="cards-tools">
              {/* The same field as the one in the rail's head, and only ever
                  one of the two on screen: this is the copy for below 1000px,
                  where the rail is a screen you have to open rather than a
                  column you can see. The bar's Search slot lands here and puts
                  the caret in it. */}
              <div className="cards-search">
                <Search size={16} strokeWidth={1.75} aria-hidden="true" />
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  onChange={(e) => {
                    leaveDashboard();
                    setQuery(e.target.value);
                  }}
                  placeholder="Search"
                  aria-label="Search the collection"
                  autoComplete="off"
                />
                {query && (
                  <button type="button" onClick={() => setQuery("")} aria-label="Clear the search">
                    <X size={15} strokeWidth={1.75} />
                  </button>
                )}
              </div>

              {/* Next to the search rather than at the end of the row. Grid or
                list is the shape of the answer, and the field is where the
                question goes in, so the two belong together; down at the end
                it was the last thing on a row that wraps, which on a phone put
                it alone on a line of its own. */}
              {!onDashboard && !onPokedex && (
                <>
                  {/* The same three controls twice, and never both on screen:
                      a panel where the page is visible around it, a sheet where
                      it is not. Swapped in the stylesheet rather than by
                      measuring the window, so the server renders one markup and
                      the browser does not correct it after hydration. */}
                  <span className="only-wide">
                    <ViewMenu
                      view={view}
                      onView={setView}
                      group={group}
                      onGroup={setGroup}
                      fields={fields}
                      onField={(f) =>
                        setFields((prev) => {
                          const next = new Set(prev);
                          if (!next.delete(f)) next.add(f);
                          return next;
                        })
                      }
                      cols={shownCols}
                      onCols={setCols}
                      min={range.min}
                      max={range.max}
                    />
                  </span>
                  <span className="only-narrow">
                    <ViewSheet
                      view={view}
                      onView={setView}
                      group={group}
                      onGroup={setGroup}
                      fields={fields}
                      onField={(f) =>
                        setFields((prev) => {
                          const next = new Set(prev);
                          if (!next.delete(f)) next.add(f);
                          return next;
                        })
                      }
                      cols={shownCols}
                      onCols={setCols}
                      min={range.min}
                      max={range.max}
                    />
                  </span>
                </>
              )}

              {/* Sorting is an answer about a list of cards, so it is only offered
                where one is being shown. Two of the three orders are by price,
                and on the public link there are no prices to order by: that
                leaves one option, and a control with one option is furniture. */}
              {!onPokedex && !onDashboard && !isPublic && (
                <Segmented
                  label="Sort"
                  value={sort}
                  onChange={(value) => {
                    leaveDashboard();
                    setSort(value);
                  }}
                  options={[
                    ["set", "By set"],
                    ["value", "Priciest"],
                    ["value-asc", "Cheapest"],
                  ]}
                />
              )}

              {/* The long tick-lists (Pokémon, rarity, value, type, owned)
                behind one button, because a facet nobody is filtering by does
                not need a permanent control. What is on shows up as chips
                under the bar. */}
              {/* Nothing behind this on the dex: rarity and type are facts about
                cards, and that view is a list of Pokémon. */}
              {/* The same facets twice, and never both on screen: the dropdown
                where the page is visible around it, the sheet where it is not.
                Swapped in the stylesheet rather than by measuring the window,
                so the server renders one markup and the browser does not have
                to correct it after hydration. */}
              {!onPokedex && (
                <>
                  <span className="only-wide">
                    <FilterMenu facets={facets} />
                  </span>
                  <span className="only-narrow">
                    <FilterSheet facets={facets} />
                  </span>
                </>
              )}

              {active && (
                <button type="button" className="cards-reset" onClick={reset}>
                  Reset
                </button>
              )}
            </div>
          )}

          {activeFilters.length > 0 && <FilterChips filters={activeFilters} onClearAll={reset} />}
        </header>

        {onProfile ? (
          <CardsProfile signedIn={signedIn} onSignOut={signOut} />
        ) : onPokedex ? (
          <CardsPokedex
            entries={dexShown}
            query={query}
            owned={dexOwned}
            // Straight to that Pokémon's cards: the dex says what you have, and
            // this is the only question anyone has after reading it.
            onPick={(name) => {
              setQuery(name);
              setSelected("all");
            }}
          />
        ) : onDashboard && stats ? (
          <CardsDashboard stats={stats} />
        ) : (
          <>
            {/* No token, a Notion outage or an empty collection all land here. Saying
          so beats an empty page that looks like something failed to paint. */}
            {sets.length === 0 ? (
              <Card className="cards-empty">
                <p>The collection is not available right now. It should be back shortly.</p>
              </Card>
            ) : filtered.length === 0 ? (
              <Card className="cards-empty">
                <p>
                  Nothing matches that combination. Try fewer filters, or a different Pokémon or
                  set.
                </p>
              </Card>
            ) : (
              onFlat ? (
                <section className="cards-set">
                  {/* One grid over every set that survived the filters. The
                      cards keep their own set name for the dialog they open,
                      which is what setName is for; what goes is the heading
                      between them. */}
                  <ul
                    className={view === "grid" ? "cards-grid" : "cards-rows"}
                    style={
                      view === "grid"
                        ? ({ "--cards-cols": String(shownCols) } as CSSProperties)
                        : undefined
                    }
                  >
                    {visibleSets.flatMap((set) =>
                      set.cards.map((card) => (
                        <CardItem
                          key={card.key}
                          card={card}
                          setName={set.name}
                          view={view}
                          // The same three conditions the by-set branch below
                          // uses. This one only checked the first, so a card
                          // with no scan at all, or one from a set already
                          // condemned as broken, still tried to draw a picture
                          // — and this is the branch the public link opens on.
                          // Two copies of one expression is exactly how that
                          // happens; they are still two, and that is the split
                          // this refactor round is for.
                          scan={
                            !!card.image &&
                            !brokenScans.has(card.key) &&
                            !brokenSets.has(set.name)
                          }
                          tilt={view === "grid" && shownCols <= TILT_UNDER}
                          big={view === "grid" && shownCols <= TILT_UNDER}
                          onScanBroken={onScanBroken}
                          fields={fields}
                          setYear={set.releaseDate?.slice(0, 4) ?? null}
                          onPick={
                            isPublic ? (c, n) => setOpenCard({ card: c, setName: n }) : undefined
                          }
                        />
                      )),
                    )}
                  </ul>
                </section>
              ) : (
              visibleSets.map((set) => (
                <section key={set.name} className="cards-set">
                  {/* Nothing at all when the set is what you picked: its logo,
                      its name and its facts are the page's own heading by then,
                      and repeating them over the grid made the page look like
                      it had lost its place. */}
                  {selected !== set.name && (
                    <div className="cards-set-head">
                      {set.logo && !brokenLogos.has(set.name) && (
                        // The box is reserved in CSS, which is what makes the lazy
                        // attribute work at all here: the rule used to be `height:44px;
                        // width:auto`, so before the file arrived the box was 44 tall
                        // and *zero* wide, and a browser never lazy-loads a zero-width
                        // image. No width until it loads, never loads without a width:
                        // every set logo on this page was permanently blank.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={set.logo}
                          alt=""
                          className="cards-set-logo"
                          loading="lazy"
                          width={set.logoSize?.width}
                          height={set.logoSize?.height}
                          // A set too new for TCGdex to have converted its logo
                          // publishes only a PNG. See retryAsPng.
                          onError={(e) =>
                            retryAsPng(e.currentTarget, () =>
                              setBrokenLogos((b) => new Set(b).add(set.name)),
                            )
                          }
                        />
                      )}
                      <div className="cards-set-text">
                        {/* One step down with the title above it: a set sits
                            inside the view rather than beside it. */}
                        <h3 className="cards-set-name">{set.name}</h3>
                        <p className="cards-set-meta">
                          {onYear
                            ? `${set.cards.length.toLocaleString(LOCALE)} ${set.cards.length === 1 ? "card" : "cards"}`
                            : setMeta(set)}
                        </p>
                      </div>
                    </div>
                  )}
                  {/* The chosen width as a custom property rather than as a
                      grid-template-columns of our own, so the auto-fill, the
                      gaps and the container query stay in the stylesheet where
                      the rest of the grid is. Nothing at all until the slider is
                      moved: see scanSize. */}
                  <ul
                    className={view === "grid" ? "cards-grid" : "cards-rows"}
                    style={
                      view === "grid"
                        ? ({ "--cards-cols": String(shownCols) } as CSSProperties)
                        : undefined
                    }
                  >
                    {set.cards.map((card) => (
                      <CardItem
                        key={card.key}
                        card={card}
                        setName={set.name}
                        view={view}
                        // Resolved here rather than handed the two Sets, so the
                        // item's props only change when the answer for that card
                        // changes. See the note on CardItem.
                        scan={
                          !!card.image && !brokenScans.has(card.key) && !brokenSets.has(set.name)
                        }
                        // Resolved here for the same reason `scan` is: one
                        // boolean the item can compare, rather than the size
                        // itself, which would be a changed prop on all 1,622
                        // items for every step of the slider.
                        tilt={view === "grid" && shownCols <= TILT_UNDER}
                        big={view === "grid" && shownCols <= TILT_UNDER}
                        onScanBroken={onScanBroken}
                        fields={fields}
                        setYear={set.releaseDate?.slice(0, 4) ?? null}
                        onPick={
                          isPublic
                            ? (card, setName) => setOpenCard({ card, setName })
                            : undefined
                        }
                      />
                    ))}
                  </ul>
                </section>
              ))
              )
            )}
            {/* Nothing to see and nothing to announce: the sets it stands for are
                built before anyone scrolls this far, so a "loading more" line
                would flash a state the reader never waits in. aria-hidden keeps
                it out of the reading order, and the count above it already says
                how many cards matched, whatever has been built so far.

                Keyed on a counter that moves on every reset and every batch, so
                the marker is a new element each time either changes. An
                IntersectionObserver reports crossings rather than standing
                state, and the case that needs this is a marker already inside
                the margin when the count resets: there is no crossing left to
                report, so it would sit there silently. Remounting hands the
                fresh observer an immediate first callback instead, which is
                what lets a short result keep growing until the page is long
                enough to push the marker out of range.

                The counter rather than the count itself, because a reset from
                six back to six is exactly the case that has to remount and is
                the one a count cannot see. */}
            {hasMore && (
              <div key={generation} ref={moreRef} className="cards-more" aria-hidden="true" />
            )}
          </>
        )}
      </section>

      {/* Last, so Tab reaches the collection before the bar under it. It is
          fixed, so where it sits in the document costs it nothing. */}
      <CardsTabBar
        active={activeTab}
        signedIn={signedIn && !isPublic}
        isPublic={isPublic}
        onSelect={(tab) =>
          tab === "sets"
            ? backToRail()
            : tab === "search"
              ? openSearch()
              : // Collection and Wishlist are the two list screens; the rail
                // calls them "all" and "wishlist", and the bar's own key for
                // the first is "collection" because "all" says nothing on a
                // label. Everything else is its own name already.
                openPane(tab === "collection" ? "all" : tab)
        }
        onAdd={() => setAdding(true)}
      />

      {/* Only when signed in: the dialog's first act is to ask the database
          what its sets are called, and that endpoint is behind the key. */}
      {/* The public link's answer to the intercepted route. Mounted always and
          drawing nothing until a card is picked, so opening one is state rather
          than a navigation the middleware would turn into a login. */}
      {isPublic && username && (
        <PublicCardDialog
          username={username}
          card={openCard?.card ?? null}
          setName={openCard?.setName ?? null}
          onClose={() => setOpenCard(null)}
          hasPrev={openIndex > 0}
          hasNext={openIndex >= 0 && openIndex < flatCards.length - 1}
          onGo={(dir) => {
            const at = flatCards[openIndex + dir];
            if (at) setOpenCard(at);
          }}
        />
      )}

      {signedIn && (
        <CardAddDialog
          open={adding}
          onClose={() => setAdding(false)}
          // A session the server has stopped accepting is worse than none:
          // every press would fail the same way with nothing saying why. Sign
          // out, which lands on the login rather than leaving a dead plus.
          onUnauthorised={() => {
            setAdding(false);
            signOut();
          }}
        />
      )}
    </>
  );
}

/**
 * One card in the grid or the list, and the reason it is its own component.
 *
 * The case it is actually for is the broken scans. A scan that 404s twice calls
 * setBrokenScans, around two hundred of them do, and that state lives above the
 * whole collection: every one of those used to re-render all 1,622 items, or
 * 19,288 nodes, to change one picture into one empty slot. They arrive spread
 * over seconds as the lazy images load, so React cannot batch them into one
 * pass. Memoised, the other 1,621 are skipped.
 *
 * Do not expect it to make searching much faster, which is what it was first
 * written for. Measured against the same build without it, at 4x CPU throttling,
 * typing "charizard" cost 789ms of script time before and 702ms after, with the
 * runs overlapping: real but inside the noise. Narrowing a search mostly
 * *unmounts* cards rather than re-rendering them, and a memo cannot skip an
 * unmount. The filtering itself was never the expense either: five norm() calls
 * over 1,622 cards benchmark at 1.9ms.
 *
 * Either way the props have to stay stable to be worth anything. `scan` is a
 * boolean the parent has already resolved rather than the two Sets it came
 * from, since a new Set on any card would otherwise change the props of all of
 * them, and `onScanBroken` is one useCallback for the whole page.
 */
const CardItem = memo(function CardItem({
  card,
  setName,
  view,
  scan,
  tilt,
  big,
  onScanBroken,
  onPick,
  fields,
  setYear,
}: {
  card: OwnedCard;
  setName: string;
  view: "grid" | "list";
  /** The year the set came out, for the Year field. Null where TCGdex has no
      date for it, which is a handful of promo sets. */
  setYear: string | null;
  /** Which optional facts to draw under the scan. See fields in CardsView. */
  fields: ReadonlySet<CardField>;
  /** Opens the card in place. Only on the public link; elsewhere it is a URL. */
  onPick?: (card: OwnedCard, setName: string) => void;
  /** Whether this card still has a scan worth trying. */
  scan: boolean;
  /** Whether this card is drawn large enough for the foil. See TILT_FROM. */
  tilt: boolean;
  /** Whether it is drawn large enough to want the bigger scan. See HIGH_FROM. */
  big: boolean;
  onScanBroken: (cardKey: string, setName: string) => void;
}) {
  /**
   * Whether this one card has been given the trading-card effect yet.
   *
   * The effect is `hover-tilt` and the foil over it is pokemon-cards-css, the
   * same pair the binder card on /about is built from: see PullScan, which is
   * where both are argued for.
   *
   * What is different here is that there are 1,622 of these rather than one, and
   * the honest answer to "can it go on all of them" is no, not standing. Each
   * instance is a custom element with a shadow root, three stylesheets injected
   * into it and `will-change: transform, box-shadow, opacity` on two layers,
   * which asks the compositor for a permanent layer per card. A browser will not
   * grant sixteen hundred of those; it drops them on a budget nobody controls.
   *
   * So a card is upgraded when it is first pointed at, and only then. One at a
   * time, and only the ones actually visited, which on any real visit is a
   * handful. It stays upgraded afterwards: leaving and coming back should not
   * pay the cost twice, and an element already in the document is free.
   */
  const [tilted, setTilted] = useState(false);
  const arm = () => {
    // Imported here rather than at the top of the file, for the reason PullScan
    // gives: the module calls customElements.define on evaluation, and a client
    // component is still evaluated on the server. Repeat calls are the module
    // cache, so this costs nothing after the first card.
    import("hover-tilt/web-component");
    setTilted(true);
  };

  /**
   * The picture, lifted out of the tree below because it is rendered in two
   * shapes: bare, and inside the tilt once this card has been armed.
   *
   * Swapping between them remounts the element, which is the price of doing this
   * per card rather than for all of them up front. By the time anyone points at
   * a card its file is decoded and in the memory cache, so the second mount
   * paints in the same frame.
   */
  const scanImg = scan ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      // The larger file once the grid is drawing cards that want it, and only
      // where TCGdex has one. The attribute is swapped on the element that is
      // already showing rather than the element being replaced, which is what
      // makes this quiet: a browser keeps painting the picture it has until the
      // new one has decoded, so crossing the threshold sharpens the grid in
      // place instead of blanking it and filling it back in.
      src={(big && highScan(card.image)) || card.image!}
      alt={card.name}
      loading="lazy"
      decoding="async"
      // Two ways a scan goes missing, and they need different answers.
      // The grid asks for `low` because it draws these at 120px, but
      // TCGdex does not publish that quality for every card and its CDN
      // is not always up. So a first failure retries at `high`, the
      // size this page used before, and only a second failure gives up
      // and shows the empty slot. A card whose artwork simply is not
      // uploaded yet ends there honestly; one whose `low` is missing
      // gets its picture back.
      //
      // A second failure also condemns the set it came from, because
      // artwork arrives per set rather than per card: if this one has
      // none, the twenty-three beside it have none either, and they
      // should not each spend two slow requests finding that out.
      onError={(e) => {
        const img = e.currentTarget;
        if (img.dataset.retried) {
          onScanBroken(card.key, setName);
          return;
        }
        img.dataset.retried = "1";
        img.src = img.src.replace("/low.webp", "/high.webp");
      }}
      // The ratio .cards-scan already reserves, stated on the element
      // too, so the browser knows the shape before the file lands
      // instead of relaying the grid out as each of a few hundred scans
      // decodes. The CSS still does the drawing (100% / 100% /
      // contain); these only describe.
      //
      // The measured size where there is one, since the scans that were
      // pulled into public/artwork have been sized exactly and 245x342
      // is only what TCGdex's `low` usually is. Same shape, one less
      // assumption.
      width={card.imageSize?.width ?? 245}
      height={card.imageSize?.height ?? 342}
    />
  ) : (
    // A card with no scan anywhere keeps its slot, and says which card it is
    // rather than sitting there as a grey rectangle. Not aria-hidden any more:
    // it carries the only text there is for this card in the grid.
    <span className="cards-scan-missing">
      <span className="cards-scan-missing-frame" aria-hidden="true" />
      <span className="cards-scan-missing-name">{card.name}</span>
      {card.number && <span className="cards-scan-missing-number">{card.number}</span>}
      <span className="sr-only">No picture available</span>
    </span>
  );

  return (
    <li className={`cards-item${card.owned ? "" : " is-wishlist"}`} data-view={view}>
      {/* Only the cards TCGdex matched have a page: the id is what addresses it,
          and an unmatched row has none. The rest stay exactly as they were
          rather than becoming a link to nowhere. The tags sit outside the link:
          they are what the card is, not somewhere to go. */}
      <CardLink id={card.tcgId} onPick={onPick ? () => onPick(card, setName) : undefined}>
        <span
          className="cards-scan"
          // Arming rather than tilting: the effect is mounted for this one card
          // and stays mounted, so a card upgrades once and never again.
          onPointerEnter={tilt && !tilted ? arm : undefined}
        >
          {tilted && scan ? (
            /* The same two props PullScan settles on, minus the shadow: these
               already carry a drop-shadow that follows the scan's transparent
               corners (.cards-scan img), and the library's own is a box behind
               a tile in a dense grid. The foil is the stylesheet's, keyed off
               the printing exactly as it is on /about. */
            <hover-tilt className="poke-tilt" tilt-factor="1" glare-intensity="0.5" glare-hue="200">
              <span
                className="poke-card"
                data-rarity={card.variants[0]?.rarity?.toLowerCase() ?? undefined}
                style={{ "--poke-scan": `url("${card.image}")` } as CSSProperties}
              >
                {scanImg}
                <span className="poke-card__shine" aria-hidden="true" />
              </span>
            </hover-tilt>
          ) : (
            scanImg
          )}
        </span>
        <span className="cards-item-text">
          <span className="cards-item-name">{card.name}</span>
          <span className="cards-item-meta">
            {fields.has("number") && card.number && (
              <span className="cards-item-number">
                {/* The hash is the difference between "085" as this card's
                    place in its set and "085" as any other number on a tile
                    that can now also carry a year. */}
                <span aria-hidden="true">#</span>
                {card.number}
              </span>
            )}
            {fields.has("type") && card.type && (
              <span className="cards-item-type">{card.type}</span>
            )}
            {fields.has("set") && <span className="cards-item-set">{setName}</span>}
            {fields.has("year") && setYear && <span className="cards-item-year">{setYear}</span>}
            {/* The era's name on its own. label() appends the years it spans,
                which is worth a heading in the rail and is noise on a tile that
                can also be showing the set's year right beside it. */}
            {fields.has("era") && card.gen && <span className="cards-item-gen">{card.gen}</span>}
          </span>
          {/* What the card costs, in euros, as one figure: the middle of the
              Near Mint range, which is what an English Near Mint copy is listed
              at, or the plain market price under €5 where no range would mean
              anything. The range itself is on the card's own page, where there
              is room for it; here it would not fit and would not add up. The
              title says which of the two the number is, because on a tile they
              look alike. A card with no listing at all has no line, not a
              zero. */}
          {fields.has("price") && card.price && euroShown(card.price) && (
            <span
              className="cards-item-price"
              title={
                card.price.nm
                  ? `About ${euroWhole(card.price.nm.low)} to ${euroWhole(card.price.nm.high)} for an English Near Mint copy · ${euro(card.price.market!)} on Cardmarket`
                  : `${euro(card.price.market!)} on Cardmarket`
              }
            >
              {euroShown(card.price)}
            </span>
          )}
          {/* One tag per printing. Holding a card normally and as a reverse holo
              is two tags under one scan, not two cards. */}
          {fields.has("rarity") && (
          <span className="cards-item-tags">
            {card.variants.map((v) => (
              <Tag
                key={`${v.rarity}-${v.owned}`}
                className={`cards-tag${v.owned ? "" : " cards-tag--want"}`}
              >
                {v.rarity ?? "Unknown"}
                {!v.owned && <span className="sr-only"> (on the wishlist)</span>}
              </Tag>
            ))}
          </span>
          )}
        </span>
      </CardLink>
    </li>
  );
});

/**
 * A row of choices with one of them on: the era switch and the sort order.
 *
 * Both are a single answer out of three, which is a segmented control rather
 * than a dropdown: three words fit in the bar, and a menu would hide the
 * current answer behind a press.
 */
function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly (readonly [T, string])[];
}) {
  return (
    <div className="cards-segmented" role="group" aria-label={label}>
      {options.map(([key, text]) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          className={`cards-segment${value === key ? " is-active" : ""}`}
          onClick={() => onChange(key)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
