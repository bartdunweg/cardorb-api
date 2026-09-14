/**
 * A card's daily prices, per printing, stored a month to a row: the shape card_price_months has.
 *
 * Bart, 2026-09-13: a price for every English card every day, back to 2024-02-08, per printing
 * ("ik wil liefst prijs per editie"), on a free plan with a 500 MB database. As one row per card per
 * day that is gigabytes; a row is about 110 bytes and the figure in it four. Grouped by card,
 * printing and month, the id, the printing, the month and the row's own overhead are paid once and
 * the days are an array of 31 cents, null where there was no reading. Measured on the live database:
 * about 280 bytes a printing-month with its index entry, and 21,023 English cards have 34,869
 * printings, so about 115 MB a year and 260 MB back to 2024.
 *
 * A printing is TCGplayer's own name for it, as tcgcsv spells the subtype and the app already asks
 * for it (price-basis.mjs printingKeysOf): "normal", "holofoil", "reverse-holofoil", "1st-edition",
 * "1st-edition-holofoil", "unlimited-holofoil", and "shadowless" / "shadowless-holofoil" for Base
 * Set's own run. Readings from before this table, which held one plain and one foil figure a day and
 * no printing, are the printings "market" and "holo" (LEGACY); a day with a real printing reads
 * those instead.
 *
 * Plain JavaScript, like price-basis.mjs, because scripts/backfill-card-prices.mjs writes the same
 * rows the API does and a script cannot import TypeScript.
 */

/** The two series card_prices kept before printings were stored, as printings of their own. */
export const LEGACY = { market: "market", holo: "holo" };

const DAYS = 31;
const PLAIN = ["normal", "unlimited", "1st-edition", "shadowless"];
const FOIL = [
  "holofoil",
  "unlimited-holofoil",
  "reverse-holofoil",
  "1st-edition-holofoil",
  "shadowless-holofoil",
];

/** tcgcsv's subtype ("Reverse Holofoil") as the printing key the app uses ("reverse-holofoil"). */
export const printingKey = (/** @type {string} */ subType) =>
  subType.toLowerCase().replace(/\s+/g, "-");

/**
 * A Shadowless product's printing, under the run it is. TCGplayer files Base Set's Shadowless run as
 * a group of its own, whose "Unlimited" is the Shadowless run and "1st Edition" the stamped one
 * (collection.ts runPrintingsForSet does the same for today's price).
 */
export const shadowlessKey = (/** @type {string} */ key) =>
  key.replace(/^unlimited|^normal$/, "shadowless");

/**
 * @typedef {object} PrintingDay
 * @property {string} tcgId
 * @property {string} printing
 * @property {string} date yyyy-mm-dd
 * @property {number | null} price euros
 * @property {string} [source]
 */

/**
 * @typedef {object} PriceMonth
 * @property {string} tcg_id
 * @property {string} printing
 * @property {string} month yyyy-mm-01
 * @property {(number | null)[]} cents index 0 is the 1st
 * @property {string} source
 */

/**
 * Days grouped into the rows they belong to: one per card, printing and month. A day given twice
 * keeps the later figure; a day with no figure is left empty.
 *
 * @param {PrintingDay[]} days
 * @returns {PriceMonth[]}
 */
export function monthsFromDays(days) {
  /** @type {Map<string, PriceMonth>} */
  const months = new Map();
  for (const d of days) {
    if (d.price == null) continue;
    const month = `${d.date.slice(0, 7)}-01`;
    const key = `${d.tcgId}|${d.printing}|${month}`;
    let row = months.get(key);
    if (!row) {
      row = {
        tcg_id: d.tcgId,
        printing: d.printing,
        month,
        cents: Array(DAYS).fill(null),
        source: d.source ?? "tcgplayer",
      };
      months.set(key, row);
    }
    row.cents[Number(d.date.slice(8, 10)) - 1] = Math.round(d.price * 100);
    if (d.source) row.source = d.source;
  }
  return [...months.values()];
}

/**
 * A day of the two series the old table had, as the printings that stand for them. The foil figure
 * is left out where it is the plain one: a reader falls back to the plain figure for a foil with
 * none, and storing it twice doubled most months.
 *
 * @param {{ tcgId: string, date: string, market: number | null, holo: number | null, source?: string }} p
 * @returns {PrintingDay[]}
 */
export const legacyDays = (p) => [
  { tcgId: p.tcgId, date: p.date, printing: LEGACY.market, price: p.market, source: p.source },
  ...(p.holo != null && p.holo !== p.market
    ? [{ tcgId: p.tcgId, date: p.date, printing: LEGACY.holo, price: p.holo, source: p.source }]
    : []),
];

/**
 * @typedef {object} DayPrices
 * @property {string} tcgId
 * @property {string} date
 * @property {number | null} market the plain printing, or the foil where there is no plain one
 * @property {number | null} holo the foil printing, or null
 * @property {Record<string, number>} [printings] every printing's figure that day, where known
 */

/**
 * Rows laid out as days, one per card per date with a figure, from `since` on, oldest first.
 *
 * Each day carries its printings and the two series every chart and line has read (`market`, the
 * plain run before the foil, and `holo`, the foil), in the order pointFromTcgplayer takes them. A
 * day with only the old series has those and no printings.
 *
 * @param {{ tcg_id: string, printing: string, month: string, cents: (number | null)[] | null }[]} rows
 * @param {string} [since] yyyy-mm-dd
 * @returns {DayPrices[]}
 */
export function daysFromMonths(rows, since = "0000-00-00") {
  /** @type {Map<string, { tcgId: string, date: string, real: Record<string, number>, legacy: Record<string, number> }>} */
  const days = new Map();
  for (const row of rows) {
    const prefix = row.month.slice(0, 8);
    const year = Number(row.month.slice(0, 4));
    const length = new Date(Date.UTC(year, Number(row.month.slice(5, 7)), 0)).getUTCDate();
    const isLegacy = row.printing === LEGACY.market || row.printing === LEGACY.holo;
    for (let i = 0; i < length; i++) {
      const c = row.cents?.[i];
      if (c == null) continue;
      const date = `${prefix}${String(i + 1).padStart(2, "0")}`;
      if (date < since) continue;
      const key = `${row.tcg_id}|${date}`;
      let day = days.get(key);
      if (!day) days.set(key, (day = { tcgId: row.tcg_id, date, real: {}, legacy: {} }));
      (isLegacy ? day.legacy : day.real)[row.printing] = c / 100;
    }
  }
  /* One printing per card for each series, the same on every day. Chosen per day, a day the
     card's own printing had no figure fell to the next in line: Base Set Charizard read its
     1st Edition ($5,266) on 14 days its unlimited holo ($869) was missing, and its chart climbed
     sixfold and back each time (Bart, 2026-09-14). The first printing in line that the card has on
     at least half as many days as its most-read one stands for it; a day without that printing
     has no figure in that series. */
  /** @type {Map<string, Record<string, number>>} */
  const counts = new Map();
  for (const d of days.values()) {
    const c = counts.get(d.tcgId) ?? {};
    for (const name of Object.keys(d.real)) c[name] = (c[name] ?? 0) + 1;
    counts.set(d.tcgId, c);
  }
  /** @param {Record<string, number>} c @param {string[]} names */
  const lineOf = (c, names) => {
    const most = Math.max(0, ...names.map((n) => c[n] ?? 0));
    return most ? (names.find((n) => (c[n] ?? 0) * 2 >= most) ?? null) : null;
  };
  /** @type {Map<string, { plain: string | null, foil: string | null }>} */
  const lines = new Map(
    [...counts].map(([tcgId, c]) => {
      /* The plain line only where it is the card's own: a printing read on at least half as many
         days as the card's most-read printing of any kind. ex8-15's 95 days of "normal" beside
         306 of holofoil made its line the scattered plain one (pricing audit, 2026-09-14). */
      const most = Math.max(0, ...Object.values(c));
      const plain = lineOf(c, PLAIN);
      return [
        tcgId,
        { plain: plain && (c[plain] ?? 0) * 2 >= most ? plain : null, foil: lineOf(c, FOIL) },
      ];
    }),
  );
  const out = [];
  for (const d of days.values()) {
    if (Object.keys(d.real).length) {
      const line = lines.get(d.tcgId) ?? { plain: null, foil: null };
      const foil = line.foil ? (d.real[line.foil] ?? null) : null;
      const plain = line.plain ? (d.real[line.plain] ?? null) : null;
      out.push({
        tcgId: d.tcgId,
        date: d.date,
        market: line.plain ? plain : foil,
        holo: foil,
        printings: d.real,
      });
    } else {
      const market = d.legacy[LEGACY.market] ?? null;
      out.push({ tcgId: d.tcgId, date: d.date, market, holo: d.legacy[LEGACY.holo] ?? null });
    }
  }
  return out.sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : a.tcgId < b.tcgId ? -1 : 1,
  );
}

/** The first of the month a date falls in, for a query on `month`. */
export const monthOf = (/** @type {string} */ date) => `${date.slice(0, 7)}-01`;
