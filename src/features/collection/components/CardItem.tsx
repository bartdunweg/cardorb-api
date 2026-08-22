"use client";

import { memo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { Badge } from "@/components/base/badges/badges";
import { highScan } from "@/lib/core/cards";
import type { CardField } from "@/features/collection/components/cards-fields";
import type { OwnedCard } from "@/lib/core/cards";
import { euro, euroWhole } from "@/lib/core/format";

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
  basePath = "/cards",
  children,
}: {
  id: string | null;
  /** Set on the public link, where a card has no URL to go to. */
  onPick?: () => void;
  /** /cards by default, the original route; CollectionScreen.tsx passes
   *  /collection/card so a card opened from the (app) shell stays in it
   *  instead of exiting to the older, separate /cards route. */
  basePath?: string;
  children: React.ReactNode;
}) {
  if (!id) return <>{children}</>;
  /**
   * "group": the focus-visible ring lands on the child .cards-scan, not on the
   * link itself, so it frames the part you are actually pointing at.
   *
   * This used to be `display: contents`, which removed the box a ring would have
   * drawn here. It also removed the box *full stop*, and an element with no
   * layout box cannot take focus: measured in Chrome on /user/<name>, all 1,609
   * cards in the grid reported zero client rects and none accepted `.focus()`.
   * Nobody could reach a card with a keyboard — WCAG 2.1.1, level A, on a public
   * page.
   *
   * `outline-hidden` does the one thing `contents` was wanted for. The flex
   * classes repeat the row/column the li sets, because the link now sits between
   * the li and the two children that used to be its direct flex items; the tags
   * stay outside the link and stay a sibling.
   */
  const linkClassName = [
    "group text-left text-inherit no-underline outline-hidden",
    "flex flex-col gap-[2px] min-w-0",
    "group-data-[view=list]/item:flex-row group-data-[view=list]/item:items-center",
    "group-data-[view=list]/item:gap-4 group-data-[view=list]/item:flex-1",
  ].join(" ");
  if (onPick) {
    return (
      <button type="button" className={linkClassName} onClick={onPick}>
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
    <Link href={`${basePath}/${id}`} className={linkClassName} scroll={false}>
      {children}
    </Link>
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
/**
 * The glass pill behind a tile on hover, in grid view only.
 *
 * An ::after rather than a background on the tile itself: the scan, the text and
 * the tags all sit above it on z-1, so the pill grows in behind them instead of
 * washing over them. It was `.cards-item[data-view="grid"]::after` plus a
 * three-selector rule lifting those children; both are here now.
 *
 * Every part is conditional on the same data-[view=grid], including the hover
 * and focus states, so nothing here can beat a narrower rule the way an
 * unconditional utility would — the conditional-reset rule, met five
 * times.
 */
const gridHoverPillClassName = [
  "data-[view=grid]:[&_.cards-scan]:relative data-[view=grid]:[&_.cards-scan]:z-1",
  "data-[view=grid]:[&_.cards-item-text]:relative data-[view=grid]:[&_.cards-item-text]:z-1",
  "data-[view=grid]:[&_.cards-item-tags]:relative data-[view=grid]:[&_.cards-item-tags]:z-1",
  "data-[view=grid]:after:content-[''] data-[view=grid]:after:absolute data-[view=grid]:after:inset-0",
  "data-[view=grid]:after:z-0 data-[view=grid]:after:rounded-orb-md",
  "data-[view=grid]:after:bg-primary data-[view=grid]:after:border",
  "data-[view=grid]:after:border-secondary data-[view=grid]:after:shadow-xs",
  "data-[view=grid]:after:opacity-0 data-[view=grid]:after:scale-[0.98]",
  "data-[view=grid]:after:transition data-[view=grid]:after:duration-150",
  "data-[view=grid]:after:ease-out",
  "data-[view=grid]:after:pointer-events-none",
  "data-[view=grid]:hover:after:opacity-100 data-[view=grid]:hover:after:scale-100",
  "data-[view=grid]:focus-within:after:opacity-100 data-[view=grid]:focus-within:after:scale-100",
].join(" ");

const CardItem = memo(function CardItem({
  card,
  setName,
  setTitle,
  view,
  scan,
  tilt,
  big,
  onScanBroken,
  onPick,
  fields,
  setYear,
  basePath,
}: {
  card: OwnedCard;
  /** What this card's set is called for matching: keys, broken-scan sets. */
  setName: string;
  /** What it is called for reading. See CardSet.title. */
  setTitle: string;
  view: "grid" | "list";
  /** The year the set came out, for the Year field. Null where TCGdex has no
      date for it, which is a handful of promo sets. */
  setYear: string | null;
  /** Which optional facts to draw under the scan. See fields in CardsView. */
  fields: ReadonlySet<CardField>;
  /** Opens the card in place. Only on the public link; elsewhere it is a URL. */
  onPick?: (card: OwnedCard, setName: string) => void;
  /** Forwarded to CardLink. See its own comment. */
  basePath?: string;
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
   * same pair TiltScan puts on a card's own page. The foil is argued for at the
   * top of app/styles/poke-holo.css; the pair as a whole is protected by
   * git history. (This used to
   * point at PullScan and the binder card on /about, and neither still exists.)
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
  const arming = useRef(false);
  const arm = () => {
    if (arming.current) return;
    arming.current = true;
    // Imported here rather than at the top of the file, for the reason TiltScan
    // gives: the module calls customElements.define on evaluation, and a client
    // component is still evaluated on the server. Repeat calls are the module
    // cache, so this costs nothing after the first card.
    //
    // Awaited before the switch, which it was not: setTilted used to run on the
    // line below the import, so React put <hover-tilt> in the document while
    // customElements.define had not run yet. That is an element with no shadow
    // root, no slot and none of its own stylesheets — the picture was drawn once
    // undefined and again on upgrade, and the gap between the two was visible as
    // a flash on the first hover of every card. The ref is because pointerenter
    // fires again before state comes back, and two arms mean two imports in
    // flight.
    import("hover-tilt/web-component")
      .then(() => setTilted(true))
      .catch(() => {
        // The scan keeps working without the effect, so a chunk that fails to
        // load leaves the card bare rather than broken — and lets the next
        // hover try again.
        arming.current = false;
      });
  };

  /**
   * The bigger file, where TCGdex publishes one. Null for a scan that is not
   * theirs, and the difference between "try the other size" and "there is no
   * other size to try".
   */
  const hiScan = highScan(card.image);
  /**
   * Whether the low-quality file failed and this card is showing the high one
   * instead. State rather than a mark on the element: the element does not
   * survive being armed (see below), and the flag used to live in its dataset,
   * so a card that had already recovered went back to the src that 404s the
   * moment you pointed at it.
   */
  const [retriedHigh, setRetriedHigh] = useState(false);

  /**
   * The picture, lifted out of the tree below because it is rendered in two
   * shapes: bare, and inside the tilt once this card has been armed.
   *
   * Swapping between them remounts it. React cannot move an element to a deeper
   * place in the tree, so the old <img> is destroyed and a new one is created,
   * and that is unavoidable without mounting the effect on all 1,622 cards. What
   * is avoidable is the blank frame it used to leave: a freshly inserted `lazy`
   * image is only tested for visibility after layout, and `async` decoding waits
   * for a later frame, so the new element arrived empty even though the file was
   * already in memory. Hence the two attributes reading `tilted`, which in here
   * means exactly "this is the second mount": the card is being pointed at, so
   * it is on screen and its file is decoded, and there is nothing left to defer.
   */
  const scanImg = scan ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="w-full h-full object-contain [filter:drop-shadow(0_2px_4px_rgba(0,0,0,0.12))_drop-shadow(0_8px_18px_rgba(0,0,0,0.2))]"
      // The larger file once the grid is drawing cards that want it, and only
      // where TCGdex has one. The attribute is swapped on the element that is
      // already showing rather than the element being replaced, which is what
      // makes this quiet: a browser keeps painting the picture it has until the
      // new one has decoded, so crossing the threshold sharpens the grid in
      // place instead of blanking it and filling it back in.
      src={((big || retriedHigh) && hiScan) || card.image!}
      alt={card.name}
      loading={tilted ? "eager" : "lazy"}
      decoding={tilted ? "sync" : "async"}
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
      //
      // A card that is already showing `high` — because it is drawn big,
      // or because it retried — has no other size left, and neither does
      // one whose scan is not TCGdex's. Those give up on the first
      // failure rather than re-requesting the file that just failed.
      onError={() => {
        if (big || retriedHigh || !hiScan) {
          onScanBroken(card.key, setName);
          return;
        }
        setRetriedHigh(true);
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
    <span
      className="flex flex-col items-center justify-center gap-1 relative w-full h-full p-3
        rounded-[4.5%/3.2%] overflow-hidden text-center
        [background:radial-gradient(120%_90%_at_50%_0%,color-mix(in_srgb,var(--color-label)_9%,transparent),transparent_70%),color-mix(in_srgb,var(--color-label)_5%,transparent)]"
    >
      <span
        aria-hidden="true"
        className="absolute inset-[6%] border border-[color-mix(in_srgb,var(--color-label)_12%,transparent)] rounded-[3%/2.2%]"
      />
      <span
        className="relative font-body font-medium text-xs
          leading-snug text-secondary line-clamp-2"
      >
        {card.name}
      </span>
      {card.number && (
        <span className="relative font-body text-xs text-tertiary tabular-nums">{card.number}</span>
      )}
      <span className="sr-only">No picture available</span>
    </span>
  );

  return (
    <li
      className={`cards-item group/item flex flex-col gap-[2px] min-w-0
        data-[view=grid]:relative data-[view=grid]:p-2 data-[view=grid]:rounded-orb-md
        ${gridHoverPillClassName}
        data-[view=list]:flex-row data-[view=list]:items-center data-[view=list]:gap-4
        data-[view=list]:py-3 data-[view=list]:border-b data-[view=list]:border-secondary
        data-[view=list]:last:border-b-0`}
      data-view={view}
    >
      {/* Only the cards TCGdex matched have a page: the id is what addresses it,
          and an unmatched row has none. The rest stay exactly as they were
          rather than becoming a link to nowhere. The tags sit outside the link:
          they are what the card is, not somewhere to go. */}
      <CardLink
        id={card.tcgId}
        onPick={onPick ? () => onPick(card, setName) : undefined}
        basePath={basePath}
      >
        <span
          className="cards-scan block relative aspect-[245/342] mb-2
            group-data-[view=list]/item:w-11 group-data-[view=list]/item:shrink-0 group-data-[view=list]/item:mb-0
            group-focus-visible:outline-2 group-focus-visible:outline-primary
            group-focus-visible:[outline-offset:3px] group-focus-visible:rounded-[2px]"
          // Arming rather than tilting: the effect is mounted for this one card
          // and stays mounted, so a card upgrades once and never again.
          onPointerEnter={tilt && !tilted ? arm : undefined}
        >
          {tilted && scan ? (
            /* The same two props TiltScan uses, minus the shadow: these already
               carry a drop-shadow that follows the scan's transparent corners,
               and the library's own is a box behind a tile in a dense grid. The
               foil is the stylesheet's, keyed off the printing. */
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
        <span className="cards-item-text flex flex-col gap-[2px] min-w-0 group-data-[view=list]/item:flex-1">
          <span
            className="cards-item-name font-body font-medium text-xs
              leading-snug text-primary line-clamp-2
              group-data-[view=list]/item:text-sm group-data-[view=list]/item:line-clamp-1"
          >
            {card.name}
          </span>
          <span
            className="cards-item-meta flex items-baseline flex-nowrap overflow-hidden gap-x-2 gap-y-[2px]
            [&>*:not(:first-child)]:before:content-['·'] [&>*:not(:first-child)]:before:mr-2
            [&>*:not(:first-child)]:before:opacity-50
              font-body text-xs text-tertiary"
          >
            {fields.has("number") && card.number && (
              <span className="tabular-nums shrink-0">
                {/* The hash is the difference between "085" as this card's
                    place in its set and "085" as any other number on a tile
                    that can now also carry a year. */}
                <span aria-hidden="true">#</span>
                {card.number}
              </span>
            )}
            {fields.has("type") && card.type && (
              <span className="min-w-0 truncate">{card.type}</span>
            )}
            {fields.has("set") && <span className="truncate">{setTitle}</span>}
            {fields.has("year") && setYear && <span>{setYear}</span>}
            {/* The era's name on its own. label() appends the years it spans,
                which is worth a heading in the rail and is noise on a tile that
                can also be showing the set's year right beside it. */}
            {fields.has("era") && card.gen && <span>{card.gen}</span>}
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
              className="font-body text-xs font-semibold
                text-primary tabular-nums mt-[2px]"
              /* The one `title=` left in the app, and it stays one. A `title`
                 is not keyboard-reachable, which is why the other two became
                 Untitled UI Tooltips — but a Tooltip needs a focusable
                 trigger, and this span renders once per card: /collection
                 draws 1,610 of them. Converting would add sixteen hundred tab
                 stops to a grid, in front of information the card's own dialog
                 already spells out on opening. Worse for the keyboard, not
                 better. Left as a pointer-only nicety on purpose. */
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
            <span className="flex flex-wrap gap-1 mt-1">
              {card.variants.map((v) => (
                <Badge
                  key={`${v.rarity}-${v.owned}`}
                  size="sm"
                  color="gray"
                  // Held is filled, wanted is not. Their two badge types carry
                  // that distinction already — `pill-color` has a background,
                  // `modern` is the page colour inside a ring — so it still
                  // survives being read in greyscale, which is the whole point
                  // of not saying it in colour alone. The outline used to be
                  // dashed; a ring cannot be, and fill-versus-none is the part
                  // that was doing the work.
                  type={v.owned ? "pill-color" : "modern"}
                >
                  {v.rarity ?? "Unknown"}
                  {!v.owned && <span className="sr-only"> (on the wishlist)</span>}
                </Badge>
              ))}
            </span>
          )}
        </span>
      </CardLink>
    </li>
  );
});

export default CardItem;
