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
    <div className="card-detail-body">
      <div className="card-detail-scan">
        {/* Inside the scan, not beside it. As a child of the body it was
            absolutely positioned against the dialog, which put the arrows on
            the window's edges with a stretch of empty card between them and the
            picture they move. */}
        {nav && <div className="card-detail-move">{nav}</div>}
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
              style={mine?.card.image ? { backgroundImage: `url("${mine.card.image}")` } : undefined}
            />
          </TiltScan>
        ) : (
          <span className="cards-scan-missing" aria-hidden="true" />
        )}
      </div>

      <div className="card-detail-text">
        <p className="card-detail-eyebrow">{mine?.setName ?? card.set?.name}</p>
        <Title className="card-detail-title">{card.name}</Title>

        {/* The range first where there is one, because it answers the question a
            collector actually asks: what an English Near Mint copy is listed at.
            It is an estimate and says so, since Cardmarket publishes no such
            figure and this is calibrated rather than fetched. Under €5 there is
            no range and the market price stands on its own. */}
        {price != null && (
          <p className="card-detail-price">
            {card.price?.nm ? (
              <>
                {euroWhole(card.price.nm.low)} – {euroWhole(card.price.nm.high)}
                <span className="card-detail-price-avg">
                  {" "}
                  estimated for an English Near Mint copy · {euro(price)} on Cardmarket
                </span>
              </>
            ) : (
              <>
                {euro(price)}
                <span className="card-detail-price-avg"> on Cardmarket</span>
              </>
            )}
          </p>
        )}

        <dl className="card-detail-facts">
          {facts
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
        </dl>

        {mine && (
          <div className="card-detail-mine">
            <p className="card-detail-mine-title">In the binder</p>
            <ul>
              {mine.card.variants.map((v, i) => (
                <li key={i}>
                  <Tag className="cards-tag">{v.rarity ?? "Unknown printing"}</Tag>
                  <span className="card-detail-mine-state">
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
        <Button href={card.cmUrl} external icon={ExternalLink} className="card-detail-cm">
          Find it on Cardmarket
        </Button>
      </div>
    </div>
  );
}
