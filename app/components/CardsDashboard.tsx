import Link from "next/link";
import { cardsMainTitleClassName } from "./cardsPageClasses";
import Card, { aboutCardClassName } from "./Card";
import CollectionValueCard from "./CollectionValueCard";
import { shownPrice } from "../../lib/core/cards";
import type { CardsStats } from "../../lib/core/cards-stats";
import { LOCALE } from "../../lib/core/config";
import { euro } from "../../lib/core/format";
import type { ValueSnapshot } from "../../lib/core/value-snapshot";
import type { Mover } from "../../lib/core/movers";

/**
 * The collection at a glance, and where /cards opens.
 *
 * It used to open on nineteen hundred cards with nothing saying what you were
 * looking at. This is the database's front page: four headline numbers, the
 * cards worth the most, and what the collection is made of.
 *
 * Owner-only. The public link has no dashboard at all — three of the blocks
 * here are about money and would have to go, and what is left is three tiles
 * and two bar charts, which is not somewhere to land. /user/<name> opens on the
 * cards, which is what the link was shared to show.
 *
 * On the charts here: both distributions are a single series answering "compare
 * magnitude", so they are one hue rather than a palette, and a single series
 * needs no legend. Values sit at the tip of each bar and every label wears a
 * text token, never the mark's colour.
 */
export default function CardsDashboard({
  stats,
  snapshots,
  movers = { up: [], down: [] },
}: {
  stats: CardsStats;
  snapshots: ValueSnapshot[];
  movers?: { up: Mover[]; down: Mover[] };
}) {
  return (
    <div className="flex flex-col gap-8">
      {/* Visible, unlike CardsView's own <h1>: that one is sr-only because the
          rail/tabbar already says which screen you're on, twice over. Neither
          exists above this content on its own — the (app) shell's own <h1> is
          sr-only too — so this is the only place "Dashboard" is actually
          written on the page. The shared cardsMainTitleClassName constant,
          not an equivalent Tailwind rebuild of it: that's the one page-title
          style already shared by Collection, Wishlist, Sets and every other
          screen CardsView draws (its own <MainTitle>), so reusing the class
          is what keeps this one in step with them rather than a second,
          similar-looking style drifting beside it. */}
      <h1 className={cardsMainTitleClassName}>Dashboard</h1>

      {/* Four numbers rather than four one-bar charts: a headline value is a
          stat tile, and a bar chart of unrelated totals compares things that do
          not belong on one scale. */}
      <ul
        className="list-none m-0 p-0 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))]"
        role="list"
      >
        <Kpi label="In the binder" value={stats.owned.toLocaleString(LOCALE)} />
        <Kpi
          label="On the wishlist"
          value={stats.wishlist.toLocaleString(LOCALE)}
          // What the list would cost, on the tile that says how long it is —
          // the obvious next question, and the one the wishlist screen cannot
          // answer without adding money to a page that deliberately has none.
          // Absent rather than €0 where nothing on the list has a price.
          note={stats.wishlistPriced > 0 ? `${euro(stats.wishlistValue)} to buy` : undefined}
        />
        <Kpi label="Sets" value={String(stats.sets)} />
        <Kpi
          // What the collection is worth, said in the plainest words there are.
          // It was "Cheapest rebuild", which is exactly what the number is and
          // not at all what anyone looking for it would scan for.
          label="Collection value"
          value={euro(stats.value)}
          // Where it sits against its own thirty-day average. This is the one
          // thing the tile could not say on its own — a number with no sense of
          // whether it is high — and unlike the chart below it needs no history
          // at all: Cardmarket publishes the average beside the price, so a
          // brand-new account gets this on its first day.
          note={movementNote(stats.movement)}
        />
      </ul>

      {/* Directly under the tiles, because it is the history of the last one
          of them. Renders nothing until this account has two readings, which
          for every account but a snapshotted one is always. */}
      <CollectionValueCard snapshots={snapshots} />

      <Movers up={movers.up} down={movers.down} />

      {stats.top.length > 0 && (
        <Card className="flex flex-col gap-2">
          <h2 className={cardsDashTitleClassName}>Priciest cards</h2>
          <p className={cardsDashSubClassName}>
            The ten worth the most, at what an English Near Mint copy is listed at.
          </p>
          {/* A table, not a chart: ten named things whose identity is the point,
              and a bar chart of them would say less than the numbers do. */}
          <table
            /* Was `.cards-dash-table` in components.css, a rule with exactly one
               consumer — this table. On Untitled UI's type and border tokens now. */
            className="w-full border-collapse text-sm text-secondary
              [&_th]:border-b [&_th]:border-secondary [&_th]:text-left [&_th]:font-semibold [&_th]:text-tertiary"
          >
            <thead>
              <tr>
                <th scope="col" className="pt-0 pr-3 pb-2 pl-0">
                  Card
                </th>
                <th
                  scope="col"
                  className="pt-0 pr-3 pb-2 pl-0 [@media(max-width:640px)]:hidden"
                >
                  Set
                </th>
                <th
                  scope="col"
                  className="pt-0 pr-3 pb-2 pl-0 text-right
                    tabular-nums whitespace-nowrap"
                >
                  Value
                </th>
              </tr>
            </thead>
            <tbody>
              {stats.top.map(({ card, set }) => (
                <tr key={card.key}>
                  <td
                    className="pt-2 pr-3 pb-2 pl-0
                      flex items-center gap-3"
                  >
                    {/* The scan, small. A list of the priciest cards is a list of
                        things you recognise by looking at them. */}
                    <span className="flex-shrink-0 block w-[22px] h-[30px] rounded-[3px] overflow-hidden bg-[var(--color-bg-grouped)]">
                      {card.image ? (
                        // Already a full URL: lib/cards.ts appends /low.webp
                        // when it builds this, so the size is settled there.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          className="w-full h-full object-cover block"
                          src={card.image}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          width={card.imageSize?.width}
                          height={card.imageSize?.height}
                        />
                      ) : (
                        <span
                          className="block w-full h-full bg-[var(--color-bg-grouped)]"
                          aria-hidden="true"
                        />
                      )}
                    </span>
                    {card.tcgId ? (
                      // Same reason as the grid: a dialog over the page, so
                      // the page underneath should not move. See CardsView.
                      <Link
                        href={`/cards/${card.tcgId}`}
                        scroll={false}
                        className="text-primary no-underline"
                      >
                        {card.name}
                      </Link>
                    ) : (
                      card.name
                    )}
                  </td>
                  <td
                    className="pt-2 pr-3 pb-2 pl-0
                      [@media(max-width:640px)]:hidden"
                  >
                    {set}
                  </td>
                  <td
                    className="pt-2 pr-3 pb-2 pl-0 text-right
                      tabular-nums whitespace-nowrap"
                  >
                    {euro(shownPrice(card.price) ?? 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <div className="grid gap-x-6 gap-y-8 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
        <Bars title="By era" caption="Cards per era, held and wanted." rows={stats.byEra} />
        <Bars title="By type" caption="Cards per type, held and wanted." rows={stats.byType} />
      </div>
    </div>
  );
}

const cardsDashTitleClassName = "m-0 text-lg font-semibold text-primary";

const cardsDashSubClassName = "m-0 text-sm text-tertiary";

/**
 * "2.1% above its 30-day average", or nothing at all.
 *
 * Nothing, rather than "0.0%", below a tenth of a percent: at that size the
 * figure is rounding in Cardmarket's own averages rather than the market
 * moving, and a tile that reports noise every day teaches people to stop
 * reading it.
 *
 * The direction is a word, not a colour or an arrow. Up is not good news here —
 * it is good if you are selling and bad if you are still buying, and the same
 * screen carries a wishlist. Green with a triangle would decide that for the
 * reader.
 */
function movementNote(m: CardsStats["movement"]): string | undefined {
  if (!m) return undefined;
  const pct = m.pct * 100;
  if (Math.abs(pct) < 0.1) return "level with its 30-day average";
  return `${Math.abs(pct).toFixed(1)}% ${pct > 0 ? "above" : "below"} its 30-day average`;
}

function Kpi({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <li className={`flex flex-col gap-1 p-5 ${aboutCardClassName}`}>
      {/* Untitled UI's metric type, lifted from MetricsSimple rather than using
          it. That component forces a "..." actions dropdown and a trend arrow
          into every tile; three of these four have neither, and a dropdown that
          opens onto nothing is worse than not using the component. Same call as
          untitledButtonClasses.ts: their design, our element. */}
      <span className="text-sm font-medium text-tertiary">{label}</span>
      {/* Proportional figures on purpose: tabular-nums gives every digit the
          width of a zero, which reads loose at this size. Tabular is for columns
          that have to line up, which is the table above, not this. */}
      <span className="text-display-sm font-semibold text-primary">{value}</span>
      {/* Under the figure rather than beside it, at the label's size and in the
          tertiary tone: it qualifies the number above and must not compete with
          it. The tiles are a grid of equal cells, so a note on two of four
          leaves the other two shorter — which is fine, because they are boxes
          on their own rows of a grid, not columns that have to line up. */}
      {note && (
        <span className="text-sm font-medium text-tertiary">
          {note}
        </span>
      )}
    </li>
  );
}

/**
 * What moved, both ways, since the earliest reading each card has.
 *
 * Under the chart because it answers the question the chart raises: the line
 * says the collection is up, this says which cards did it. Renders nothing
 * until there are two weeks of readings, which for a new account is a month —
 * the same rule as the chart, and for the same reason. One reading is not a
 * movement.
 *
 * Risers and fallers side by side rather than one list sorted through zero. A
 * collection usually has both, and a single list would bury whichever direction
 * was smaller that week under the other.
 */
function Movers({ up, down }: { up: Mover[]; down: Mover[] }) {
  if (!up.length && !down.length) return null;
  return (
    <div className="grid gap-x-6 gap-y-8 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
      <MoverList title="Gone up" rows={up} />
      <MoverList title="Gone down" rows={down} />
    </div>
  );
}

function MoverList({ title, rows }: { title: string; rows: Mover[] }) {
  if (!rows.length) return null;
  const span = rows[0]!;
  return (
    <Card className="flex flex-col gap-2">
      <h2 className={cardsDashTitleClassName}>{title}</h2>
      <p className={cardsDashSubClassName}>
        {/* The window is stated rather than assumed: each card is compared
            against its own earliest reading, and a card added last month has
            less history than one that has been here since the table did. */}
        Since {formatMonthDay(span.from)}, by what it did to the total.
      </p>
      <ul className="list-none m-0 p-0 flex flex-col gap-2" role="list">
        {rows.map((m) => (
          <li key={m.card.key} className="flex items-baseline justify-between gap-3">
            <span className="font-body text-xs text-primary overflow-hidden text-ellipsis whitespace-nowrap">
              {m.card.tcgId ? (
                <Link
                  href={`/cards/${m.card.tcgId}`}
                  scroll={false}
                  className="text-primary no-underline"
                >
                  {m.card.name}
                </Link>
              ) : (
                m.card.name
              )}{" "}
              <span className="text-tertiary">{m.set}</span>
            </span>
            {/* Tabular here, unlike the tiles: these are a column of figures
                meant to be compared down the page. The sign is written out
                because a minus alone at this size is a hyphen. */}
            <span
              className="font-body text-xs
                tabular-nums whitespace-nowrap text-secondary"
            >
              {m.change > 0 ? "+" : "−"}
              {euro(Math.abs(m.change))}
              <span className="text-tertiary"> ({Math.abs(Math.round(m.pct * 100))}%)</span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** "12 May" — the month is the honest unit for a weekly series. */
const formatMonthDay = (iso: string) =>
  new Date(iso).toLocaleDateString(LOCALE, { day: "numeric", month: "long" });

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
    <Card className="flex flex-col gap-2">
      <h2 className={cardsDashTitleClassName}>{title}</h2>
      <p className={cardsDashSubClassName}>{caption}</p>
      <ul className="list-none m-0 p-0 flex flex-col gap-2" role="list">
        {rows.map((row) => (
          <li
            key={row.value}
            className="grid items-center gap-3 [grid-template-columns:minmax(0,8rem)_minmax(0,1fr)_auto]"
          >
            <span
              className="p-0 border-0 bg-transparent text-left font-body
                text-xs text-secondary overflow-hidden text-ellipsis whitespace-nowrap"
            >
              {row.value}
            </span>
            <span className="h-[10px] rounded-orb-sm bg-[var(--color-surface-subtle)] overflow-hidden">
              <span
                className="block h-full bg-[var(--color-tint)] [border-radius:0_4px_4px_0]"
                style={{ width: `${(row.count / max) * 100}%` }}
              />
            </span>
            <span
              className="font-body text-xs
                tabular-nums text-tertiary"
            >
              {row.count}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
