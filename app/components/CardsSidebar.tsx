"use client";

import { Heart, LayoutDashboard, Layers, ListOrdered, Plus, UserRound } from "lucide-react";
import type { CardSet, ImageSize } from "../../lib/core/cards";
import { LOCALE } from "../../lib/core/config";

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
export default function CardsSidebar({
  sets,
  setGroups,
  selected,
  pane,
  onSelect,
  signedIn,
  isPublic = false,
  onAdd,
  brokenLogos,
  onBrokenLogo,
}: {
  sets: CardSet[];
  /** The same sets, under the era each one belongs to. */
  setGroups: { era: string; label: string; sets: CardSet[] }[];
  /** "dashboard", "pokedex", "profile", "all", or a set name. */
  selected: string;
  /** Which of the two panes is showing, below the width they both fit at.
      Undefined until one has been chosen, which is the results. */
  pane: "rail" | "main" | undefined;
  onSelect: (value: string) => void;
  /** The one search on the page, shown here above 1000px. See the head below. */
  signedIn: boolean;
  /** On the public link there is no Profile row: there is nothing to sign into. */
  isPublic?: boolean;
  onAdd: () => void;
  brokenLogos: Set<string>;
  onBrokenLogo: (name: string) => void;
}) {
  // Held and wanted are two destinations now, so the rail counts them apart.
  // A single total over both was the number that made "My collection" read as
  // 1,645 while the collection is 1,612 and the other 33 are a shopping list.
  const held = sets.reduce((n, s) => n + s.cards.filter((c) => c.owned).length, 0);
  const wanted = sets.reduce((n, s) => n + s.cards.filter((c) => !c.owned).length, 0);

  return (
    // On the rail rather than on .page-cards, which is a server component two
    // files up: .cards-main is this element's next sibling, so one attribute
    // here is enough for the stylesheet to hide either side.
    <div className="cards-rail" data-pane={pane}>
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
      <p className="cards-rail-title" aria-hidden="true">
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
        <div className="cards-rail-head">
          <button
            type="button"
            className="btn btn--icon cards-rail-add"
            onClick={onAdd}
            aria-label="Add a card"
            title="Add a card"
          >
            <Plus size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      )}

      <nav aria-label="Collection">
        <ul className="cards-nav" role="list">
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
            <li className="cards-nav-elsewhere">
              <NavItem
                active={selected === "dashboard"}
                onClick={() => onSelect("dashboard")}
                name="Dashboard"
                // An icon where the sets carry their logo, so the two rows sit
                // on the same left edge as everything under them.
                icon={LayoutDashboard}
              />
            </li>
          )}
          <li className="cards-nav-elsewhere">
            <NavItem
              active={selected === "pokedex"}
              onClick={() => onSelect("pokedex")}
              name="Pokédex"
              icon={ListOrdered}
            />
          </li>
          {/* On the public link the bar carries these two, so below 1000px they
              come out of the rail and it becomes the list of sets its title
              says it is. Signed in the bar has no room for them — the plus and
              the dashboard have the slots — so there they stay. */}
          <li className={isPublic ? "cards-nav-elsewhere" : undefined}>
            <NavItem
              active={selected === "all"}
              onClick={() => onSelect("all")}
              name="My collection"
              count={held}
              icon={Layers}
            />
          </li>
          {/* Only where there is one. An empty wishlist is a row that answers a
              question nobody asked, and the count beside it would be a zero. */}
          {wanted > 0 && (
            <li className={isPublic ? "cards-nav-elsewhere" : undefined}>
              <NavItem
                active={selected === "wishlist"}
                onClick={() => onSelect("wishlist")}
                name="Wishlist"
                count={wanted}
                icon={Heart}
              />
            </li>
          )}
          {!isPublic && (
            <li>
              <NavItem
                active={selected === "profile"}
                onClick={() => onSelect("profile")}
                name="Profile"
                icon={UserRound}
              />
            </li>
          )}
          {/* The hairline between the destinations and the sets. It goes with
              them: on the public link below 1000px there is nothing above it,
              and a rule dividing one thing from nothing is a line for its own
              sake. */}
          <li
            aria-hidden="true"
            className={`cards-nav-rule${isPublic ? " cards-nav-elsewhere" : ""}`}
          />
          {/* Fifty-one sets in one run is a wall. Under the era they belong to
              it is a handful of short lists, and the label is the thing a
              collector already sorts by. */}
          {setGroups.map((group, i) => (
            <li key={group.era}>
              {/* A hairline between one era and the next, the same one that
                  separates the sets from the two rows above them. The label
                  alone had to carry the break on its own, which at --fs-small
                  and tertiary is not a line anyone reads as one. */}
              {i > 0 && <span aria-hidden="true" className="cards-nav-rule" />}
              {/* The label is the selection for the whole era, which is what the
                  Era facet used to be. One control instead of two: a heading you
                  can press beats the same list of eras repeated as tick boxes
                  further down the rail. */}
              <button
                type="button"
                className={`cards-nav-era${selected === `era:${group.era}` ? " is-active" : ""}`}
                onClick={() => onSelect(`era:${group.era}`)}
                aria-pressed={selected === `era:${group.era}`}
              >
                {group.label}
              </button>
              <ul className="cards-nav" role="list">
                {group.sets.map((set) => (
                  <li key={set.name}>
                    <NavItem
                      active={selected === set.name}
                      onClick={() => onSelect(set.name)}
                      name={set.name}
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
  icon?: React.ComponentType<{ size?: number; strokeWidth?: number; "aria-hidden"?: boolean }>;
  onBrokenLogo?: () => void;
}) {
  return (
    <button
      type="button"
      className={`cards-nav-item${active ? " is-active" : ""}`}
      onClick={onClick}
      aria-pressed={active}
    >
      {(logo !== undefined || Icon) && (
        <span className="cards-nav-art">
          {Icon ? (
            <Icon size={18} strokeWidth={1.75} aria-hidden={true} />
          ) : logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logo}
              alt=""
              loading="lazy"
              decoding="async"
              width={logoSize?.width}
              height={logoSize?.height}
              onError={(e) => retryAsPng(e.currentTarget, onBrokenLogo)}
            />
          ) : (
            <span className="cards-nav-blank" aria-hidden="true" />
          )}
        </span>
      )}
      <span className="cards-nav-name">{name}</span>
      {count != null && (
        <span className="cards-nav-count">
          {count.toLocaleString(LOCALE)}
          {/* The bare number is enough to look at and not enough to hear. */}
          <span className="sr-only"> cards</span>
        </span>
      )}
    </button>
  );
}
