"use client";

import { cardsNavElsewhereClassName } from "@/components/custom/cardsPageClasses";
import { Compass03, Heart, LayersThree01, LayoutAlt01, Plus, User01 } from "@untitledui-pro/icons/line";
import type { CardSet, ImageSize } from "@/lib/core/cards";
import { LOCALE } from "@/lib/core/config";
import Wordmark from "@/components/custom/Wordmark";
import { Avatar } from "@/components/base/avatar/avatar";
import { possessive } from "@/lib/core/owner";
import { Button as UntitledButton } from "@/components/base/buttons/button";
import { Tooltip } from "@/components/base/tooltip/tooltip";

/**
 * The left rail on /cards: where you are, and nothing else.
 *
 * The sets are navigation rather than a facet. They were one of seven tick-box
 * groups behind a single "Filter" button, which made the most obvious way to
 * browse a collection the least reachable thing on the page. Everything that
 * narrows what is shown now lives in the toolbar above the results, so the rail
 * answers one question, which part of the collection am I looking at, and the
 * bar answers the other. A rail that did both was a column you had to scroll
 * past the sets to reach the filters in.
 *
 * No heading of its own either: the page's h1 belongs over the thing you are
 * reading, which is the pane on the right.
 *
 * Deliberately not shared with /fifa. The two routes wear the same
 * design system and are different products, so the rail is written twice rather
 * than abstracted into a shell that would tie a change in one to the other.
 */
/**
 * The pill a rail row lifts onto when you point at it.
 *
 * Was `.cards-nav-item::after` in components.css, with a second rule turning it
 * on for :hover, :focus-visible and .is-active. Both are here, and every part is
 * an `after:` variant so the row that draws it also owns it.
 *
 * `--pill-radius` stays a variable rather than becoming a class: the two callers
 * want different radii on the same recipe, and a variable set on the element is
 * how that was already expressed.
 */
const navPillClassName = [
  "after:absolute after:z-0 after:content-[''] after:pointer-events-none",
  "after:[border-radius:var(--pill-radius,var(--radius-pill))]",
  "after:bg-primary after:ring-1 after:ring-secondary after:ring-inset after:shadow-xs",
  "after:opacity-0 after:scale-[0.98]",
  "after:transition after:duration-150 after:ease-out",
  "hover:after:opacity-100 hover:after:scale-100",
  "focus-visible:after:opacity-100 focus-visible:after:scale-100",
  "[&.is-active]:after:opacity-100 [&.is-active]:after:scale-100",
].join(" ");

export default function CardsSidebar({
  sets,
  setGroups,
  selected,
  pane,
  onSelect,
  signedIn,
  isPublic = false,
  ownerName,
  onAdd,
  brokenLogos,
  onBrokenLogo,
  setsAsRow = false,
  viewer,
}: {
  sets: CardSet[];
  /** The same sets, under the era each one belongs to. */
  setGroups: { era: string; label: string; sets: CardSet[] }[];
  /** "dashboard", "pokedex", "profile", "all", "sets", or a set name. */
  selected: string;
  /** Which of the two panes is showing, below the width they both fit at.
      Undefined until one has been chosen, which is the results. */
  pane: "rail" | "main" | undefined;
  onSelect: (value: string) => void;
  /** The one search on the page, shown here above 1000px. See the head below. */
  signedIn: boolean;
  /** On the public link there is no Profile row: there is nothing to sign into. */
  isPublic?: boolean;
  /** What to call the owner in the rail heading. Public only, resolved by the
   *  server from the profile this page belongs to — see CardsView's own prop. */
  ownerName?: string;
  onAdd: () => void;
  brokenLogos: Set<string>;
  onBrokenLogo: (name: string) => void;
  /** AppSidebar's collection routes have their own set index at
   *  /collection/sets (SetIndex.tsx) — a real page, linkable and reachable at
   *  every width. There the fifty-one-set era list below would just be a
   *  second copy of that page stuffed into the rail, so this collapses it to
   *  one "Sets" row that opens it instead. The legacy /cards route has no such
   *  page, so it leaves this false and keeps the full list. */
  setsAsRow?: boolean;
  /** Shown pinned to the bottom of the rail, above 1000px only — the same
   *  destination as the Profile row (onSelect("profile")), reached a second
   *  way. Optional: the legacy /cards route has no avatar to show. */
  viewer?: { name: string; avatarUrl: string | null };
}) {
  // Held and wanted are two destinations now, so the rail counts them apart.
  // A single total over both was the number that made "My collection" read as
  // 1,645 while the collection is 1,612 and the other 33 are a shopping list.
  const collectionName =
    isPublic && ownerName ? `${possessive(ownerName)} collection` : "My collection";
  const held = sets.reduce((n, s) => n + s.cards.filter((c) => c.owned).length, 0);
  const wanted = sets.reduce((n, s) => n + s.cards.filter((c) => !c.owned).length, 0);

  return (
    // On the rail rather than on .page-cards, which is a server component two
    // files up: .cards-main is this element's next sibling, so one attribute
    // here is enough for the stylesheet to hide either side.
    <div
      // Only gap/padding/background/blur are Tailwind here — display,
      // position, height, overflow, border-right and box-shadow all stay CSS
      // (still ".cards-rail"): every one of them is conditionally reset by
      // the <=1000px pane-swap block below, and an unconditional Tailwind
      // utility for any of them would now beat that reset (Tailwind utilities
      // outrank legacy CSS regardless of the legacy rule's specificity, see
      // ADR-0012) — caught live: the rail stopped hiding on a narrow phone.
      /**
       * `peer`, and that is the whole trick.
       *
       * The pane swap was `.cards-rail[data-pane="rail"] + .cards-main` — a
       * sibling selector, which is why AppShell's comment insists nothing may
       * come between these two elements. Tailwind spells the same relationship
       * `peer` / `peer-data-[...]`, so the rule moves onto the elements without
       * either of them learning about the other, and the constraint stays
       * exactly what it was.
       *
       * Every rule here is inside `[@media(max-width:1000px)]:` or above it,
       * never both, so no unconditional utility can beat a conditional one —
       * the ADR-0012/ADR-0017 rule this file's old comment was written for.
       */
      className="cards-rail peer group/rail flex flex-col gap-5 px-3 py-4
        bg-primary [backdrop-filter:blur(var(--blur-glass-card))]
        sticky top-0 h-[100dvh] overflow-y-auto border-r border-secondary
        [@media(max-width:1000px)]:static [@media(max-width:1000px)]:h-auto
        [@media(max-width:1000px)]:overflow-visible [@media(max-width:1000px)]:border-r-0
        [@media(max-width:1000px)]:[box-shadow:none]
        [@media(max-width:1000px)]:not-data-[pane=rail]:!hidden
        [@media(max-width:1000px)]:data-[pane=rail]:[animation:cards-pane-in_200ms_var(--ease-out)]
        motion-reduce:animate-none"
      data-pane={pane}
    >
      {/* What this screen is, and only on the widths where the rail is a screen
          of its own: without it you arrive at fifty sets with nothing saying
          what they are a list of. Above 1000px the heading over the results is
          on view anyway and this would be a second one.

          "Sets", not "Cards". It is only ever reached by pressing the slot
          labelled Sets, and a screen that answers to a different name than the
          button that opened it makes you check whether you pressed the right
          one. Cards is the app; this is one screen in it.

          aria-hidden, and not a heading: the h1 in CardsView already named the
          page and it is in the document whichever pane is up. This is the same
          fact drawn for anyone who can see the layout. */}
      <p
        className="hidden [@media(max-width:1000px)]:block [@media(max-width:1000px)]:mb-4
          [@media(max-width:1000px)]:p-2 [@media(max-width:1000px)]:font-body
          [@media(max-width:1000px)]:font-medium [@media(max-width:1000px)]:text-display-sm
          [@media(max-width:1000px)]:leading-tight [@media(max-width:1000px)]:text-primary"
        aria-hidden="true"
      >
        Sets
      </p>

      {/* Adding, at the head of the rail, above 1000px only. The search field
          used to sit here beside it and does not any more: a field in the rail
          searches whatever screen happens to be on the right, including the
          dashboard and the Pokédex, which are not lists it can narrow. It
          belongs to the two screens that are lists, and it is on them.

          Below 1000px this whole head is gone. The bar along the bottom carries
          the plus. */}
      {signedIn && (
        <div className="flex items-center justify-between gap-2 pt-0 px-4 pb-4 [@media(max-width:1000px)]:hidden">
          <Wordmark href="/" />
          {/* Their Tooltip rather than `title=`, which only ever appears on
              hover — see the note at the same button in CardsTabBar.tsx. */}
          <Tooltip title="Add a card" placement="bottom">
            {/* Icon-only: their Button takes the icon as a slot and sizes it
                itself, rather than a child drawn at a size chosen here. */}
            <UntitledButton
              color="primary"
              className="flex-none"
              iconLeading={Plus}
              onPress={onAdd}
              aria-label="Add a card"
            />
          </Tooltip>
        </div>
      )}

      <nav aria-label="Collection">
        <ul className="list-none m-0 p-0 flex flex-col gap-[2px]" role="list">
          {/* Not sets, but the places the sets are not: without them the
              dashboard is unreachable the moment you open one.

              Two of the four are marked as the bar's own. Below 1000px the bar
              along the bottom carries Dashboard and Pokédex, and two controls
              for one destination six pixels apart is one too many. All cards
              and Profile stay: the bar carries neither, and Profile is here
              rather than in the bar precisely because this is the one place
              that exists at every width. */}
          {/* The public link has no dashboard: with the money taken out it was
              three tiles and two bar charts, which is not a destination. It
              opens on the collection instead. */}
          {!isPublic && (
            <li className={cardsNavElsewhereClassName}>
              <NavItem
                active={selected === "dashboard"}
                onClick={() => onSelect("dashboard")}
                name="Dashboard"
                // An icon where the sets carry their logo, so the two rows sit
                // on the same left edge as everything under them.
                icon={LayoutAlt01}
              />
            </li>
          )}
          {/* On the public link the bar carries these two, so below 1000px they
              come out of the rail and it becomes the list of sets its title
              says it is. Signed in the bar has no room for them — the plus and
              the dashboard have the slots — so there they stay. */}
          <li className={isPublic ? cardsNavElsewhereClassName : undefined}>
            <NavItem
              active={selected === "all"}
              onClick={() => onSelect("all")}
              name={collectionName}
              count={held}
              icon={LayersThree01}
            />
          </li>
          {/* Only where there is one. An empty wishlist is a row that answers a
              question nobody asked, and the count beside it would be a zero. */}
          {wanted > 0 && (
            <li className={isPublic ? cardsNavElsewhereClassName : undefined}>
              <NavItem
                active={selected === "wishlist"}
                onClick={() => onSelect("wishlist")}
                name="Wishlist"
                count={wanted}
                icon={Heart}
              />
            </li>
          )}
          {/* Only where there is no avatar footer to reach Profile from
              instead (below) — the legacy /cards route, which passes no
              viewer. Where there is one, a second way to the same place in
              the list above it is a row answering a question the footer
              already answers. */}
          {!isPublic && !viewer && (
            <li>
              <NavItem
                active={selected === "profile"}
                onClick={() => onSelect("profile")}
                name="Profile"
                icon={User01}
              />
            </li>
          )}
          {/* The hairline between the destinations and the sets. It goes with
              them: on the public link below 1000px there is nothing above it,
              and a rule dividing one thing from nothing is a line for its own
              sake. */}
          <li
            aria-hidden="true"
            className={`block h-px m-2 bg-secondary${isPublic ? " cards-nav-elsewhere" : ""}`}
          />
          {setsAsRow ? (
            <li>
              <NavItem
                // A specific set or era (anything not one of the rail's own
                // fixed rows) is still "Sets", just one screen deeper — the
                // individual rows that used to carry that highlight are gone
                // now that setsAsRow collapses them, so this row has to answer
                // for all of it or nothing lights up while looking at a set.
                active={
                  selected === "sets" ||
                  !["dashboard", "all", "wishlist", "profile", "browse"].includes(selected)
                }
                onClick={() => onSelect("sets")}
                name="Sets"
                count={sets.length}
                icon={LayersThree01}
              />
            </li>
          ) : null}
          {/* The catalogue, next to the collection, and only where there is an
              account to mark cards against — the public link has no viewer to
              answer "do you have this one" for. It sits under Sets rather than
              beside Dashboard because it is the same question one step wider:
              your sets, then every set. No count, deliberately: the number of
              sets that exist is a fact about the hobby, not about you, and a
              174 in the rail would read as something of yours. */}
          {setsAsRow && !isPublic && (
            <li>
              <NavItem
                active={selected === "browse"}
                onClick={() => onSelect("browse")}
                name="Browse"
                icon={Compass03}
              />
            </li>
          )}
          {!setsAsRow &&
            // Fifty-one sets in one run is a wall. Under the era they belong to
            // it is a handful of short lists, and the label is the thing a
            // collector already sorts by.
            setGroups.map((group, i) => (
              <li key={group.era}>
                {/* A hairline between one era and the next, the same one that
                    separates the sets from the two rows above them. The label
                    alone had to carry the break on its own, which at --fs-small
                    and tertiary is not a line anyone reads as one. */}
                {i > 0 && (
                  <span
                    aria-hidden="true"
                    className="block h-px m-2 bg-secondary"
                  />
                )}
                {/* The label is the selection for the whole era, which is what the
                    Era facet used to be. One control instead of two: a heading you
                    can press beats the same list of eras repeated as tick boxes
                    further down the rail. */}
                <button
                  type="button"
                  className={`sticky top-0 z-[1] w-full mt-4 mb-1 mx-0 px-2 py-1
                    border-0 rounded-orb-sm bg-primary text-left cursor-pointer font-body
                    text-xs font-medium text-tertiary
                    hover:text-primary first:mt-0
                    ${selected === `era:${group.era}` ? "text-primary bg-secondary" : ""}`}
                  onClick={() => onSelect(`era:${group.era}`)}
                  aria-pressed={selected === `era:${group.era}`}
                >
                  {group.label}
                </button>
                <ul className="list-none m-0 p-0 flex flex-col gap-[2px]" role="list">
                  {group.sets.map((set) => (
                    <li key={set.name}>
                      <NavItem
                        active={selected === set.name}
                        onClick={() => onSelect(set.name)}
                        // The label is the catalogue's name; everything that
                        // selects, keys or remembers is still set.name. The two
                        // are different questions and this row asks both.
                        name={set.title}
                        // How many are held, beside the name rather than under
                        // it. "12 of 84 cards" on a second line turned a list of
                        // fifty-one sets into a wall of two-line rows for a fact
                        // the set's own header states in full anyway.
                        count={set.cards.length}
                        logo={set.logo && !brokenLogos.has(set.name) ? set.logo : null}
                        logoSize={set.logoSize}
                        onBrokenLogo={() => onBrokenLogo(set.name)}
                      />
                    </li>
                  ))}
                </ul>
              </li>
            ))}
        </ul>
      </nav>

      {signedIn && viewer && (
        // sticky bottom-0 rather than mt-auto: mt-auto only reaches the
        // viewport edge when the rest of the rail's content is shorter than
        // the rail itself, which stopped being reliably true once setsAsRow
        // (ADR-0027) made the content's height depend on how many rows are
        // signed-in-only vs public. Sticky keeps this pinned to the visible
        // bottom of the scrollable rail either way — its own background is
        // needed so content scrolled underneath does not show through.
        <button
          type="button"
          onClick={() => onSelect("profile")}
          className={`cards-nav-item ${navPillClassName} [&>*]:relative [&>*]:z-[1] sticky bottom-0 z-[1] mt-auto flex items-center gap-3 w-full p-2
            border-0 rounded-orb-md bg-primary text-left cursor-pointer text-inherit
            [@media(max-width:1000px)]:hidden`}
        >
          {/* Their <Avatar>. The set logo below stays an <img> — that one is a
              catalogue asset with a PNG retry on error, not a person. */}
          <Avatar
            size="xs"
            src={viewer.avatarUrl}
            alt=""
            initials={viewer.name.charAt(0).toUpperCase()}
            className="shrink-0"
          />
          <span className="flex-1 min-w-0 font-body font-medium text-xs text-primary truncate">
            {viewer.name}
          </span>
        </button>
      )}
    </div>
  );
}

/**
 * A set logo that 404s, tried once more as a PNG before it is given up on.
 *
 * lib/cards.ts asks TCGdex for `logo.webp`, because that is what it publishes
 * for every set it has had time to convert. A set as new as Pitch Black only
 * has `logo.png`, so the rail and the set header showed a blank for it, and
 * the 404 carries no cache-control: every visit spent a second travelling to
 * origin to be told the same thing.
 *
 * Here rather than in the URL builder on purpose. Deciding it server-side means
 * a HEAD request per set, fifty-one of them, to catch the one or two that are
 * this new. The browser already has the answer in the error it just got.
 */
export function retryAsPng(img: HTMLImageElement, giveUp?: () => void) {
  if (img.src.endsWith(".webp")) {
    img.src = img.src.replace(/\.webp$/, ".png");
    return;
  }
  giveUp?.();
}

/** One row: what it is called, and how many cards are in it, on one line. */
function NavItem({
  active,
  onClick,
  name,
  count,
  logo,
  logoSize,
  icon: Icon,
  onBrokenLogo,
}: {
  active: boolean;
  onClick: () => void;
  name: string;
  count?: number;
  logo?: string | null;
  /** Threaded down beside the URL so the rail reserves the space. See lib/cards.ts. */
  logoSize?: ImageSize;
  icon?: React.ComponentType<{
    size?: number;
    strokeWidth?: number;
    fill?: string;
    "aria-hidden"?: boolean;
  }>;
  onBrokenLogo?: () => void;
}) {
  return (
    <button
      type="button"
      // The active row's own background is gone: it now just leaves the
      // hover pill (.cards-nav-item::after, components.css) permanently on
      // via .is-active, the same surface a row lifts onto when pointed at
      // rather than a second, flatter treatment of its own — see the
      // tabbar's matching change (CardsTabBar.tsx/tabbarClasses.ts), the
      // two are meant to read as one visual language now.
      className={`cards-nav-item ${navPillClassName} [&>*]:relative [&>*]:z-[1] after:inset-0 [--pill-radius:var(--radius-orb-md)] relative flex items-center gap-3
        w-full p-2 border-0 rounded-orb-md bg-transparent text-left cursor-pointer text-inherit${active ? " is-active" : ""}`}
      onClick={onClick}
      aria-pressed={active}
    >
      {(logo !== undefined || Icon) && (
        <span className="flex-shrink-0 flex items-center justify-center w-9 h-7">
          {Icon ? (
            <Icon
              size={18}
              strokeWidth={1.75}
              fill={active ? "currentColor" : "none"}
              aria-hidden={true}
            />
          ) : logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="max-w-full max-h-full object-contain block"
              src={logo}
              alt=""
              loading="lazy"
              decoding="async"
              width={logoSize?.width}
              height={logoSize?.height}
              onError={(e) => retryAsPng(e.currentTarget, onBrokenLogo)}
            />
          ) : (
            <span className="block w-full h-full rounded-orb-sm bg-secondary" aria-hidden="true" />
          )}
        </span>
      )}
      <span className="flex-1 min-w-0 font-body font-medium text-xs text-primary truncate">
        {name}
      </span>
      {count != null && (
        <span className="flex-shrink-0 font-body text-xs tabular-nums text-tertiary">
          {count.toLocaleString(LOCALE)}
          {/* The bare number is enough to look at and not enough to hear. */}
          <span className="sr-only"> cards</span>
        </span>
      )}
    </button>
  );
}
