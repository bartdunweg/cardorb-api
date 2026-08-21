import Button from "./Button";
import TiltScan from "./TiltScan";
import Tag from "./Tag";
import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import type { CardDetail as Detail, OwnedCard } from "../../lib/core/cards";
import { euro, euroWhole } from "../../lib/core/format";

/**
 * One card, in full: the scan and everything known about it.
 *
 * Shared between the route and the modal that intercepts it, so the two cannot
 * drift. The page around it differs (a heading and a way back on one, a dialog
 * on the other); what a card is does not.
 */
export default function CardDetail({
  card,
  mine,
  heading = "h1",
  nav,
}: {
  card: Detail;
  mine: { card: OwnedCard; setName: string } | null;
  /** h1 on the route, h2 inside the dialog, where the page already has one. */
  heading?: "h1" | "h2";
  /**
   * Whatever moves you to the card either side of this one, drawn over the
   * scan. A slot rather than two ids, because this is a server component and
   * the two hosts reach the neighbours differently: the route links to them by
   * URL, the public dialog swaps them in place with no URL to link to.
   */
  nav?: ReactNode;
}) {
  const price = card.price?.market ?? null;
  const Title = heading;

  // Everything on the right, in one list, so a fact with no answer simply is
  // not a row rather than a label with a dash after it.
  // TCGdex writes the stage without a space ("Stage2"), which is fine as a
  // machine value and wrong as a label.
  const stage = card.stage?.replace(/^Stage(\d)/, "Stage $1") ?? null;
  const facts: [string, string][] = [
    ["Set", card.set?.name ?? ""],
    ["Number", mine?.card.number ?? ""],
    ["Rarity", card.rarity ?? ""],
    ["Type", card.types.join(", ") || mine?.card.type || ""],
    ["HP", card.hp != null ? String(card.hp) : ""],
    ["Stage", card.evolveFrom ? `${stage ?? "Evolution"} of ${card.evolveFrom}` : (stage ?? "")],
    ["Illustrator", card.illustrator ?? ""],
    ["Regulation", card.regulationMark ?? ""],
  ];

  return (
    <div
      // margin-top stays in cards.css: .modal--card overrides it to 0 for the
      // dialog variant, an unconditional Tailwind mt-* would always win over that.
      className="card-detail-body mt-6 flex w-full flex-col gap-6"
    >
      {/* The scan shrunk to a header thumbnail beside the name/price, rather
          than a full-height column beside all the facts — the scan was
          taking the same width as the text no matter how little of the
          right column it was actually next to by the time the facts ran
          out. Stacks on a phone for the same reason it always did: a
          two-column split there would leave the artwork the size it is in
          the grid. */}
      <div className="flex items-start gap-5 [@media(max-width:640px)]:flex-col [@media(max-width:640px)]:items-center">
        <div
          className="card-detail-scan relative w-[140px] shrink-0
            [@media(max-width:640px)]:w-[min(200px,62%)]"
        >
          {/* Inside the scan, not beside it. As a child of the body it was
              absolutely positioned against the dialog, which put the arrows on
              the window's edges with a stretch of empty card between them and the
              picture they move. Half on the picture and half off it, at the
              scan's own edges (rather than the dialog's, which on a phone put
              them against the window with a stretch of empty card between them
              and what they move). */}
          {nav && (
            <div
              className="card-detail-move absolute z-2 top-1/2 -translate-y-1/2
                flex justify-between pointer-events-none
                [left:calc(-1*var(--space-4))] -right-4"
            >
              {nav}
            </div>
          )}
          {card.image ? (
            // The full-size scan: this is the one place on the site where the
            // artwork is the point, so it gets `high` where the grid takes `low`.
            // Not next/image: TCGdex serves webp already and the optimiser would
            // only re-encode it.
            //
            // Behind it, as a background, the small scan the grid just drew. That
            // one is local and already in the browser's cache, so it paints in the
            // same frame the dialog opens in, and the 77kB high-resolution file
            // fades over it whenever it lands. Without it the dialog opened onto
            // an empty rectangle for as long as TCGdex' CDN took, which is what
            // "opening a card feels slow" actually was.
            <TiltScan
              scan={mine?.card.image ?? null}
              rarity={mine?.card.variants[0]?.rarity ?? card.rarity}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${card.image}/high.webp`}
                alt={card.name}
                width={734}
                height={1024}
                fetchPriority="high"
                decoding="async"
                style={
                  mine?.card.image ? { backgroundImage: `url("${mine.card.image}")` } : undefined
                }
              />
            </TiltScan>
          ) : (
            <span
              className="flex flex-col items-center justify-center gap-1 relative w-full h-full p-3
                rounded-[4.5%/3.2%] overflow-hidden text-center aspect-[245/342]
                [background:radial-gradient(120%_90%_at_50%_0%,color-mix(in_srgb,var(--color-label)_9%,transparent),transparent_70%),color-mix(in_srgb,var(--color-label)_5%,transparent)]"
              aria-hidden="true"
            />
          )}
        </div>

        <div className="card-detail-text min-w-0 flex-1 [@media(max-width:640px)]:text-center">
          <p className="m-0 font-body text-xs text-tertiary">
            {mine?.setName ?? card.set?.name}
          </p>
          <Title
            className="mt-1 mb-0 font-body font-medium
              text-display-sm leading-tight text-primary"
          >
            {card.name}
          </Title>

          {/* The range first where there is one, because it answers the question a
              collector actually asks: what an English Near Mint copy is listed at.
              It is an estimate and says so, since Cardmarket publishes no such
              figure and this is calibrated rather than fetched. Under €5 there is
              no range and the market price stands on its own. */}
          {price != null && (
            <p
              className="mt-4 mb-0 font-body font-medium
                text-display-xs text-primary lining-nums tabular-nums"
            >
              {card.price?.nm ? (
                <>
                  {euroWhole(card.price.nm.low)} – {euroWhole(card.price.nm.high)}
                  <span
                    className="font-body text-xs
                      font-normal text-tertiary"
                  >
                    {" "}
                    estimated for an English Near Mint copy · {euro(price)} on Cardmarket
                  </span>
                </>
              ) : (
                <>
                  {euro(price)}
                  <span
                    className="font-body text-xs
                      font-normal text-tertiary"
                  >
                    {" "}
                    on Cardmarket
                  </span>
                </>
              )}
            </p>
          )}
        </div>
      </div>

      <div>
        <dl className="mt-0 mb-0 grid gap-2">
          {facts
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k} className="grid grid-cols-[104px_minmax(0,1fr)] gap-3 items-baseline">
                <dt className="font-body text-xs text-tertiary">
                  {k}
                </dt>
                <dd className="m-0 font-body text-sm text-primary">
                  {v}
                </dd>
              </div>
            ))}
        </dl>

        {mine && (
          <div className="mt-6 pt-6 border-t border-[var(--color-border)]">
            <p className="m-0 mb-3 font-body text-xs text-tertiary">
              In the binder
            </p>
            <ul className="m-0 p-0 list-none flex flex-col gap-2">
              {mine.card.variants.map((v, i) => (
                <li key={i} className="flex items-center gap-3">
                  <Tag className="[background:color-mix(in_srgb,var(--color-label)_7%,transparent)] text-xs text-secondary">
                    {v.rarity ?? "Unknown printing"}
                  </Tag>
                  <span className="font-body text-xs text-tertiary">
                    {v.owned ? "Owned" : "On the wishlist"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Cardmarket is where the price comes from and the only place the
            condition can actually be filtered: their feed gives one lowest
            price across every condition, their site lets you ask for Near
            Mint. So the honest thing is to send you there rather than to
            print a number we cannot qualify.

            This used to be `Products/Singles?idProduct=N`, built from the id
            TCGdex carries. That landed on the Singles listing rather than on
            the card, because the id is a parameter of a page that does not
            route on it. It was then a search on the card's name and the name of
            its set, which was worse: it found nothing at all, because a product
            on Cardmarket is named for its attacks and the expansion is not part
            of anything the search looks at.

            It is now the card's own page, at the path generated by
            scripts/cardmarket-links.mjs. See cardmarketUrl in lib/cards.ts for
            the two cards in forty that still fall back to a search. */}
        <Button href={card.cmUrl} external icon={ExternalLink} className="mt-6">
          Find it on Cardmarket
        </Button>
      </div>
    </div>
  );
}
