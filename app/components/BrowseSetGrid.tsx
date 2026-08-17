"use client";

import Link from "next/link";
import { cardsMainTitleClassName } from "./cardsPageClasses";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import Segmented from "./Segmented";
import { useCollection } from "../(app)/CollectionContext";
import { LOCALE } from "../../lib/core/config";
import type { BrowseCard } from "../../lib/core/ownership";
import type { CatalogueSet } from "../../lib/core/ptcg-browse";

/**
 * One whole set, with the cards you hold marked and the ones you do not still
 * on the page.
 *
 * This is the screen the feature was asked for. Every other grid in the app is
 * built from rows in the collection, so a card nobody owns has nowhere to be
 * drawn; here the catalogue is the list and ownership is an attribute of it.
 *
 * A missing card is dimmed rather than hidden or greyed to nothing: the point of
 * showing it is that it is a gap in a set you can see the shape of. It carries
 * an Add button, because "I don't have this one" is the exact moment the add
 * dialog is wanted, and the dialog opens on the card already found rather than
 * on a search box asking you to type its name back (see onAddCard in
 * CollectionContext.tsx).
 *
 * The whole set arrives at once rather than paged. It is 207 cards at the top
 * end, fetched server-side and cached for a day by ptcg-browse.ts, and a
 * "load more" between you and the second half of a set you are trying to see
 * the shape of would be answering the wrong question. /api/v1/catalog/sets/:id
 * pages for the clients that want it.
 */
export default function BrowseSetGrid({ set, cards }: { set: CatalogueSet; cards: BrowseCard[] }) {
  const { onAddCard } = useCollection();
  const [show, setShow] = useState<"all" | "owned" | "missing">("all");
  /**
   * Cards whose scan 404'd twice, so the slot stops trying.
   *
   * Not memoised per card the way CardItem is, and that is a considered
   * difference rather than an oversight: CardItem carries a memo because two
   * hundred of a collection's sixteen hundred scans break, arriving over
   * seconds and re-rendering everything each time. A browsed set has already
   * passed catalogue.ts's whole-set HEAD probe before any of these URLs are
   * built, so a break here is the rare per-card gap, not a wave of them.
   */
  const [broken, setBroken] = useState<Set<string>>(new Set());

  const shown = useMemo(
    () =>
      cards.filter((card) =>
        show === "owned" ? card.owned : show === "missing" ? !card.owned : true,
      ),
    [cards, show],
  );

  const owned = cards.filter((c) => c.owned).length;
  const n = (v: number) => v.toLocaleString(LOCALE);

  return (
    <div className="flex flex-col gap-6 pb-[var(--page-pad-bottom)]">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        {set.logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={set.logo}
            alt=""
            decoding="async"
            className="h-12 max-w-[220px] object-contain object-left"
          />
        )}
        <div className="flex flex-col gap-1 min-w-0">
          <h1 className={cardsMainTitleClassName}>{set.name}</h1>
          <p className="[font-family:var(--font-body)] [font-size:var(--fs-small)] text-label-secondary m-0 tabular-nums">
            {n(owned)} of {n(cards.length)} in your collection
            {/* The year alone, not the full date. It is what CardItem's Year
                field shows and what a collector places a set by, and formatting
                the whole date would mean building a Date in a client component
                from a string the server already rendered — a hydration mismatch
                waiting for a browser in another timezone. */}
            {set.releaseDate && ` · ${set.releaseDate.slice(0, 4)}`}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Which cards to show"
          value={show}
          onChange={setShow}
          options={[
            ["all", `All ${n(cards.length)}`],
            ["owned", `Yours ${n(owned)}`],
            ["missing", `Missing ${n(cards.length - owned)}`],
          ]}
        />
        <Link
          href="/collection/browse"
          className="[font-family:var(--font-body)] [font-size:var(--fs-small)] text-label-secondary
            underline underline-offset-2 hover:text-label"
        >
          All sets
        </Link>
      </div>

      {/* The segmented control's aria-pressed says which filter is on; it does
          not say what the filter did. Without this the grid silently changes
          length under anyone not looking at it. */}
      <p aria-live="polite" className="sr-only">
        {shown.length} {shown.length === 1 ? "card" : "cards"} shown
      </p>

      {!shown.length ? (
        /* Three ways to arrive at an empty grid and three different things to
           say. The third is the one worth spelling out: a set the catalogue
           lists but has not indexed the cards of is not the same as a set you
           have finished, and saying "you have every card" there would be a
           congratulation for nothing. */
        <p className="cards-empty">
          {!cards.length
            ? "The catalogue doesn't list any cards for this set yet."
            : show === "owned"
              ? "You have none of this set yet."
              : "You have every card in this set."}
        </p>
      ) : (
        <ul
          className="grid [grid-template-columns:repeat(auto-fill,minmax(120px,1fr))] gap-x-3 gap-y-5 m-0 p-0 list-none"
          role="list"
        >
          {shown.map((card) => (
            <li key={card.id} className="flex flex-col gap-[2px] min-w-0">
              <span className="block relative aspect-[245/342] mb-2">
                {/* The whole difference between held and missing, in one
                    property. Opacity rather than greyscale because these scans
                    are the only thing on the tile that says which card it is,
                    and a colourless Charizard is harder to recognise than a
                    faint one. It is never the only signal either: the line
                    under every tile says which of the three states this is, so
                    the distinction survives being read without seeing it. */}
                {card.image && !broken.has(card.id) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={card.image}
                    alt={card.name}
                    loading="lazy"
                    decoding="async"
                    width={245}
                    height={342}
                    className={`w-full h-full object-contain
                      [filter:drop-shadow(0_2px_4px_rgba(0,0,0,0.12))_drop-shadow(0_8px_18px_rgba(0,0,0,0.2))]
                      ${card.owned ? "" : "opacity-40"}`}
                    /* The same two-strikes rule CardItem uses, and for the same
                       reason: TCGdex does not publish `low` for every card it
                       has a `high` of, so a first failure retries at the larger
                       size and only a second gives up. A card the swap left on
                       pokemontcg.io has no /low.webp in its URL, so the replace
                       is a no-op and it fails straight through to the slot. */
                    onError={(e) => {
                      const img = e.currentTarget;
                      if (img.dataset.retried || !img.src.includes("/low.webp")) {
                        setBroken((prev) =>
                          prev.has(card.id) ? prev : new Set(prev).add(card.id),
                        );
                        return;
                      }
                      img.dataset.retried = "1";
                      img.src = img.src.replace("/low.webp", "/high.webp");
                    }}
                  />
                ) : (
                  <span
                    className="flex flex-col items-center justify-center gap-1 w-full h-full p-3
                      rounded-[4.5%/3.2%] text-center [font-size:var(--fs-small)] text-label-secondary
                      [background:color-mix(in_srgb,var(--color-label)_5%,transparent)]"
                  >
                    {card.name}
                  </span>
                )}
              </span>

              <span
                className="[font-family:var(--font-main)] [font-weight:var(--fw-title)] [font-size:var(--fs-small)]
                  [line-height:var(--lh-snug)] text-label line-clamp-2"
              >
                {card.name}
              </span>

              <span
                className="flex items-baseline gap-2 [font-family:var(--font-body)]
                  [font-size:var(--fs-small)] text-label-tertiary"
              >
                <span className="tabular-nums shrink-0">
                  <span aria-hidden="true">#</span>
                  {card.number}
                </span>
                {card.rarity && <span className="min-w-0 truncate">{card.rarity}</span>}
              </span>

              {/* Three states, three sentences. "Owned" alone would leave the
                  wishlist looking like a gap, which is the one thing this
                  screen exists to distinguish. */}
              {card.owned ? (
                <span className="[font-family:var(--font-body)] [font-size:var(--fs-tiny)] [font-weight:var(--fw-eyebrow)] text-label-secondary tabular-nums">
                  In your collection{card.quantity > 1 && ` · ${n(card.quantity)}×`}
                </span>
              ) : card.wishlist ? (
                <span className="[font-family:var(--font-body)] [font-size:var(--fs-tiny)] [font-weight:var(--fw-eyebrow)] text-label-tertiary">
                  On your wishlist
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onAddCard(card)}
                  className="inline-flex items-center gap-1 self-start mt-[2px] py-1 px-2 rounded-pill
                    border border-[var(--color-border)] bg-transparent text-label-secondary
                    [font-family:var(--font-main)] [font-size:var(--fs-tiny)] [font-weight:var(--fw-button)]
                    hover:text-label hover:[border-color:var(--color-border-active)]
                    focus-visible:outline-2 focus-visible:[outline-color:var(--color-label)] focus-visible:[outline-offset:2px]"
                >
                  <Plus size={12} aria-hidden="true" />
                  Add
                  {/* The button says "Add" five dozen times on one page; the
                      accessible name has to say which card each one adds. */}
                  <span className="sr-only">
                    {" "}
                    {card.name}, number {card.number}, to your collection
                  </span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
