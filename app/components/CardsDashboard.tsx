import Link from "next/link";
import Card from "./Card";
import CollectionValueCard from "./CollectionValueCard";
import { shownPrice } from "../../lib/core/cards";
import type { CardsStats } from "../../lib/core/cards-stats";
import { LOCALE } from "../../lib/core/config";
import { euro } from "../../lib/core/format";

/**
 * The collection at a glance, and where /cards now opens.
 *
 * It used to open on nineteen hundred cards with nothing saying what you were
 * looking at. This is the database's front page: four headline numbers, the
 * cards worth the most, and what the collection is made of.
 *
 * On the charts here: both distributions are a single series answering "compare
 * magnitude", so they are one hue rather than a palette, and a single series
 * needs no legend. Values sit at the tip of each bar and every label wears a
 * text token, never the mark's colour.
 */
export default function CardsDashboard({
  stats,
  isPublic = false,
}: {
  stats: CardsStats;
  /**
   * The public link shows what the collection is, not what it is worth. Three
   * of the blocks below are entirely about money and are the reason this flag
   * exists: the value tile, its history, and the priciest ten.
   *
   * The tile row is built for four and gets three here. That is deliberate
   * rather than overlooked: the grid wraps them evenly, and inventing a fourth
   * number to fill the hole would be decoration.
   */
  isPublic?: boolean;
}) {
  return (
    <div className="cards-dash">
      {/* Numbers rather than one-bar charts: a headline value is a stat tile,
          and a bar chart of unrelated totals compares things that do not belong
          on one scale. */}
      <ul className="cards-kpis" role="list">
        <Kpi label="In the binder" value={stats.owned.toLocaleString(LOCALE)} />
        <Kpi label="On the wishlist" value={stats.wishlist.toLocaleString(LOCALE)} />
        <Kpi label="Sets" value={String(stats.sets)} />
        {!isPublic && (
          <Kpi
            // What the collection is worth, said in the plainest words there
            // are. It was "Cheapest rebuild", which is exactly what the number
            // is and not at all what anyone looking for it would scan for.
            label="Collection value"
            value={euro(stats.value)}
          />
        )}
      </ul>

      {/* Directly under the tiles, because it is the history of the last one
          of them. */}
      {!isPublic && <CollectionValueCard />}

      {!isPublic && stats.top.length > 0 && (
        <Card className="cards-dash-block">
          <h2 className="cards-dash-title">Priciest cards</h2>
          <p className="cards-dash-sub">
            The ten worth the most, at what an English Near Mint copy is listed at.
          </p>
          {/* A table, not a chart: ten named things whose identity is the point,
              and a bar chart of them would say less than the numbers do. */}
          <table className="cards-dash-table">
            <thead>
              <tr>
                <th scope="col">Card</th>
                <th scope="col" className="cards-dash-set">
                  Set
                </th>
                <th scope="col" className="cards-dash-num">
                  Value
                </th>
              </tr>
            </thead>
            <tbody>
              {stats.top.map(({ card, set }) => (
                <tr key={card.key}>
                  <td className="cards-dash-card">
                    {/* The scan, small. A list of the priciest cards is a list of
                        things you recognise by looking at them. */}
                    <span className="cards-dash-thumb">
                      {card.image ? (
                        // Already a full URL: lib/cards.ts appends /low.webp
                        // when it builds this, so the size is settled there.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={card.image}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          width={card.imageSize?.width}
                          height={card.imageSize?.height}
                        />
                      ) : (
                        <span className="cards-dash-thumb-blank" aria-hidden="true" />
                      )}
                    </span>
                    {card.tcgId ? (
                      // Same reason as the grid: a dialog over the page, so
                      // the page underneath should not move. See CardsView.
                      <Link href={`/cards/${card.tcgId}`} scroll={false}>
                        {card.name}
                      </Link>
                    ) : (
                      card.name
                    )}
                  </td>
                  <td className="cards-dash-set">{set}</td>
                  <td className="cards-dash-num">{euro(shownPrice(card.price) ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <div className="cards-dash-pair">
        <Bars title="By era" caption="Cards per era, held and wanted." rows={stats.byEra} />
        <Bars title="By type" caption="Cards per type, held and wanted." rows={stats.byType} />
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <li className="cards-kpi about-card">
      <span className="cards-kpi-label">{label}</span>
      {/* Proportional figures on purpose: tabular-nums gives every digit the
          width of a zero, which reads loose at this size. Tabular is for columns
          that have to line up, which is the table above, not this. */}
      <span className="cards-kpi-value">{value}</span>
    </li>
  );
}

/** One distribution: a label, a bar, and its count at the tip. */
function Bars({
  title,
  caption,
  rows,
}: {
  title: string;
  caption: string;
  rows: { value: string; count: number }[];
}) {
  if (rows.length === 0) return null;
  // Scaled against the largest bar rather than the total, so the shortest row is
  // still visible: these are magnitudes next to each other, not shares of a whole.
  const max = Math.max(...rows.map((r) => r.count));
  return (
    <Card className="cards-dash-block">
      <h2 className="cards-dash-title">{title}</h2>
      <p className="cards-dash-sub">{caption}</p>
      <ul className="cards-bars" role="list">
        {rows.map((row) => (
          <li key={row.value} className="cards-bar-row">
            <span className="cards-bar-label">{row.value}</span>
            <span className="cards-bar-track">
              <span className="cards-bar-fill" style={{ width: `${(row.count / max) * 100}%` }} />
            </span>
            <span className="cards-bar-value">{row.count}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
