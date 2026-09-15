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

/**
 * The catalogues a card id can be from, and so the first half of a price row's key.
 *
 * English and Japanese TCGdex ids collide: neo1 to neo4 are set ids in both, and neo4-100 to neo4-113
 * are cards in both (neo4-106 is Shining Celebi in English and Lucky Stadium in Japanese). Keyed on
 * the id alone, a Japanese product's figure was written into Shining Celebi's line (2026-09-14), so
 * since migration 20260915161000 every row says which catalogue its id is from, and a row that does
 * not say is refused rather than filed as English.
 */
export const PRICE_LANGUAGES = /** @type {const} */ (["en", "ja"]);

/** @typedef {(typeof PRICE_LANGUAGES)[number]} PriceLanguage */

/**
 * The catalogue a copy's card id is from, by the copy's language: a Japanese copy carries a Japanese
 * catalogue id and every other language shares the English catalogue (tcgdex-language.ts
 * cataloguesFor).
 *
 * @param {string | null | undefined} language
 * @returns {PriceLanguage}
 */
export const priceLanguageOf = (language) => (language === "ja" ? "ja" : "en");

/**
 * One card of one catalogue as a map key: the id alone is not a card.
 *
 * @param {PriceLanguage} language
 * @param {string} tcgId
 */
export const historyKey = (language, tcgId) => `${language}|${tcgId}`;

/** @param {unknown} language @returns {PriceLanguage} */
const languageOrThrow = (language) => {
  if (language === "en" || language === "ja") return language;
  throw new Error(`A price reading without its catalogue's language (${String(language)})`);
};

/** The two series card_prices kept before printings were stored, as printings of their own. */
export const LEGACY = { market: "market", holo: "holo" };

const DAYS = 31;
const PLAIN = ["normal", "unlimited", "1st-edition", "shadowless", "blue-border"];
const FOIL = [
  "holofoil",
  "unlimited-holofoil",
  "reverse-holofoil",
  "1st-edition-holofoil",
  "shadowless-holofoil",
];

/**
 * A Poké Ball, Master Ball or Energy Symbol reverse's printing, under the card it is a print of:
 * "poke-ball-reverse-holofoil". TCGplayer files each as a product of its own, priced as "Holofoil"
 * in one set and "Reverse Holofoil" in another; stored under one name, so a copy and a chart ask
 * for it the same way everywhere (price-basis.mjs printingKeysOf).
 */
export const finishPrintingKey = (/** @type {string} */ finish) => `${finish}-reverse-holofoil`;

/**
 * A printing sold as a product of its own, under the card, by its finish: a Japanese mirror holo
 * (finish "reverse-holo") is the card's "reverse-holofoil", the name a reverse copy already asks
 * for (price-basis.mjs printingKeysOf); a patterned reverse is finishPrintingKey's.
 */
export const printProductKey = (/** @type {string} */ finish) =>
  finish === "reverse-holo" ? "reverse-holofoil" : finishPrintingKey(finish);

/** tcgcsv's subtype ("Reverse Holofoil") as the printing key the app uses ("reverse-holofoil"). */
export const printingKey = (/** @type {string} */ subType) =>
  subType.toLowerCase().replace(/\s+/g, "-");

/**
 * A Shadowless product's printing, under the run it is. TCGplayer files Base Set's Shadowless run as
 * a group of its own, whose "Unlimited" is the Shadowless run and "1st Edition" the stamped one
 * (collection.ts runPrintingsForSet does the same for today's price).
 */
export const shadowlessKey = (/** @type {string} */ key) => runKey("shadowless", key);

/**
 * A run TCGplayer sells as a product of its own, under the run it is: the product's "Unlimited" or
 * plain printing is the run ("normal" to "blue-border", "unlimited-holofoil" to
 * "shadowless-holofoil"), and a stamped printing keeps its name.
 *
 * @param {string} edition
 * @param {string} key
 */
export const runKey = (edition, key) => key.replace(/^unlimited|^normal$/, edition);

/**
 * The link fields tcgplayer-links.mjs writes for a card's separately sold runs, and the edition
 * each is: Base Set's Shadowless run (its own group), and My First Battle's Blue Border cards
 * (a product of their own beside the plain card).
 */
export const RUN_FIELDS = /** @type {const} */ ({
  shadowless: "shadowless",
  blueBorder: "blue-border",
});

/**
 * A card's separately sold runs, as its link has them: the edition and the product.
 *
 * @param {Partial<Record<keyof typeof RUN_FIELDS, { productId: number, groupId?: number }>> | null | undefined} link
 * @returns {{ edition: string, productId: number, groupId?: number }[]}
 */
export const runLinksOf = (link) =>
  Object.entries(RUN_FIELDS).flatMap(([field, edition]) => {
    const run = link?.[/** @type {keyof typeof RUN_FIELDS} */ (field)];
    return run ? [{ edition, ...run }] : [];
  });

/**
 * @typedef {object} PrintingDay
 * @property {PriceLanguage} language the catalogue tcgId is from
 * @property {string} tcgId
 * @property {string} printing
 * @property {string} date yyyy-mm-dd
 * @property {number | null} price euros
 * @property {string} [source]
 */

/**
 * @typedef {object} PriceMonth
 * @property {PriceLanguage} language
 * @property {string} tcg_id
 * @property {string} printing
 * @property {string} month yyyy-mm-01
 * @property {(number | null)[]} cents index 0 is the 1st
 * @property {string} source
 */

/**
 * Days grouped into the rows they belong to: one per catalogue, card, printing and month. A day
 * given twice keeps the later figure; a day with no figure is left empty. A day that does not say
 * which catalogue its card is from throws: filed under a guess, it is how two cards' lines mixed.
 *
 * @param {PrintingDay[]} days
 * @returns {PriceMonth[]}
 */
export function monthsFromDays(days) {
  /** @type {Map<string, PriceMonth>} */
  const months = new Map();
  for (const d of days) {
    if (d.price == null) continue;
    const language = languageOrThrow(d.language);
    const month = `${d.date.slice(0, 7)}-01`;
    const key = `${language}|${d.tcgId}|${d.printing}|${month}`;
    let row = months.get(key);
    if (!row) {
      row = {
        language,
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
 * @param {{ language: PriceLanguage, tcgId: string, date: string, market: number | null, holo: number | null, source?: string }} p
 * @returns {PrintingDay[]}
 */
export const legacyDays = (p) => [
  {
    language: p.language,
    tcgId: p.tcgId,
    date: p.date,
    printing: LEGACY.market,
    price: p.market,
    source: p.source,
  },
  ...(p.holo != null && p.holo !== p.market
    ? [
        {
          language: p.language,
          tcgId: p.tcgId,
          date: p.date,
          printing: LEGACY.holo,
          price: p.holo,
          source: p.source,
        },
      ]
    : []),
];

/**
 * @typedef {object} DayPrices
 * @property {PriceLanguage} language the catalogue tcgId is from
 * @property {string} tcgId
 * @property {string} date
 * @property {number | null} market the plain printing, or the foil where there is no plain one
 * @property {number | null} holo the foil printing, or null
 * @property {Record<string, number>} [printings] every printing's figure that day, where known
 * @property {Record<string, number>} [held] the printings whose figure that day is an earlier one held
 *   over a stray one, each with the stray figure it stands in for
 */

/** How far off its neighbours' median a figure may be, either way, before it is not read. */
const STRAY_RATIO = 5;
/** The neighbours: the same printing's figures this many days either side. */
const STRAY_WINDOW_DAYS = 30;
/** Fewer figures than this in the window, the figure itself included, and nothing is judged. */
const STRAY_MIN_FIGURES = 3;
/**
 * A run of stray figures this long at the end of a printing's line is its new price, not a stray:
 * a week of one level with nothing after it to say otherwise.
 */
const STRAY_SETTLED_FIGURES = 7;

const dayNumber = (/** @type {string} */ date) => Date.parse(`${date}T00:00:00Z`) / 86_400_000;

/** A scarcer run of a card, and the run it cannot sell under: the first of these the day has. */
const SCARCER_RUNS = /** @type {[string, string[]][]} */ ([
  ["1st-edition-holofoil", ["holofoil", "unlimited-holofoil"]],
  ["shadowless-holofoil", ["holofoil", "unlimited-holofoil"]],
  ["1st-edition", ["normal", "unlimited"]],
  ["shadowless", ["normal", "unlimited"]],
]);
/** How many times its base a scarcer run's figure is on a typical day, before a day under it is stray. */
const SCARCER_PREMIUM = 2;

/**
 * Takes out a 1st Edition or Shadowless figure under the same card's unlimited run that day, on a
 * card whose stamped run typically sells for SCARCER_PREMIUM times that run or more.
 *
 * Where half a printing's figures are a stray sale, a median cannot tell which half is: Base Set
 * Charizard's 1st Edition read €260 on as many days of June 2026 as €8,600, beside an unlimited holo
 * at €470. Judged per card rather than for every card: Neo Destiny's 1st Edition holos sell under
 * their unlimited run on every day read, and a rule that the stamped run is always dearer took out
 * all 106 days of neo4-11's line.
 *
 * @param {{ card: string, date: string, real: Record<string, number>, held: Record<string, number> }[]} days
 * @param {Taken[]} taken the figures taken out, added to
 */
function dropScarcerRunsUnderTheirBase(days, taken) {
  /** @param {Record<string, number>} real @param {string[]} bases */
  const baseOf = (real, bases) => bases.map((b) => real[b]).find((v) => v != null) ?? null;
  /** @type {Map<string, number[]>} */
  const ratios = new Map();
  for (const { card, real } of days) {
    for (const [scarce, bases] of SCARCER_RUNS) {
      const base = baseOf(real, bases);
      if (real[scarce] == null || !base) continue;
      const key = `${card}|${scarce}`;
      ratios.set(key, [...(ratios.get(key) ?? []), real[scarce] / base]);
    }
  }
  /** @type {Set<string>} */
  const premium = new Set();
  for (const [key, list] of ratios) {
    const sorted = list.sort((a, b) => a - b);
    if (sorted[sorted.length >> 1] >= SCARCER_PREMIUM) premium.add(key);
  }
  for (const { card, date, real, held } of days) {
    for (const [scarce, bases] of SCARCER_RUNS) {
      const base = baseOf(real, bases);
      if (premium.has(`${card}|${scarce}`) && base != null && real[scarce] < base) {
        taken.push({ card, date, figures: real, held, printing: scarce, value: real[scarce] });
        delete real[scarce];
      }
    }
  }
}

/**
 * Takes out of each day a printing's figure that is STRAY_RATIO times off the median of that
 * printing's figures within STRAY_WINDOW_DAYS either side.
 *
 * TCGplayer's market price is its last sales, and a card that hardly sells has a market price one
 * odd sale sets. Base Set Charizard's 1st Edition read $10,000 on most days of July 2026 and $250 on
 * eleven, with its cheapest listing at $100,000 throughout (tcgcsv's archive for 2026-07-15), and
 * the sheet's chart dropped from €8,700 to €219 and back each time (Bart, 2026-09-15). 277 printings
 * moved more than five times between March and September 2026.
 *
 * On read rather than on write: the rows stay what TCGplayer said, so a wrong call here is undone by
 * changing a number, and the rows already stored are judged the same as tonight's. The cost is a
 * real move of five times or more within a month, whose first days read as stray until the new
 * price outnumbers the old.
 *
 * @param {{ card: string, date: string, real: Record<string, number>, legacy: Record<string, number>, held: Record<string, number> }[]} days
 * @param {Taken[]} taken the figures taken out, added to
 */
function dropStrayFigures(days, taken) {
  /** @type {Map<string, (Taken & { day: number })[]>} */
  const series = new Map();
  for (const d of days) {
    for (const figures of [d.real, d.legacy]) {
      for (const [printing, value] of Object.entries(figures)) {
        const key = `${d.card}|${printing}`;
        const list = series.get(key) ?? [];
        list.push({
          card: d.card,
          date: d.date,
          day: dayNumber(d.date),
          figures,
          held: d.held,
          printing,
          value,
        });
        series.set(key, list);
      }
    }
  }
  for (const list of series.values()) {
    if (list.length < STRAY_MIN_FIGURES) continue;
    list.sort((a, b) => a.day - b.day);
    const stray = [];
    let from = 0;
    let to = 0;
    for (const point of list) {
      while (list[from].day < point.day - STRAY_WINDOW_DAYS) from++;
      while (to < list.length && list[to].day <= point.day + STRAY_WINDOW_DAYS) to++;
      if (to - from < STRAY_MIN_FIGURES) continue;
      const values = list
        .slice(from, to)
        .map((p) => p.value)
        .sort((a, b) => a - b);
      const mid = values.length >> 1;
      const median = values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
      if (median > 0 && (point.value > median * STRAY_RATIO || point.value * STRAY_RATIO < median))
        stray.push(point);
    }
    /* The line's last figures, all stray and all one level, are a new price that has not yet
       outnumbered the old one in its window: #463 gave ex11-12's reverse its own figure (€905
       against €86) on 1 September, and a fortnight on it still read €86. Further back, the days
       after a run say what it was; at the end nothing does, so a week of it is taken as the price.
       Should the old level come back, the run is judged again with that behind it. */
    let settled = 0;
    while (settled < stray.length && stray.at(-1 - settled) === list.at(-1 - settled)) settled++;
    if (settled >= STRAY_SETTLED_FIGURES) {
      const run = stray.slice(-settled).map((p) => p.value);
      if (Math.max(...run) < Math.min(...run) * STRAY_RATIO) stray.length -= settled;
    }
    // Taken out after the pass, so each figure is weighed against what was stored, not what is left.
    for (const p of stray) {
      delete p.figures[p.printing];
      taken.push(p);
    }
  }
}

/**
 * @typedef {object} Taken
 * @property {string} card
 * @property {string} date
 * @property {Record<string, number>} figures the day's figures the printing was taken out of
 * @property {Record<string, number>} held the day's held figures, the stray ones they stand in for
 * @property {string} printing
 * @property {number} value the figure taken out
 */

/**
 * Puts back in each figure taken out the printing's last figure before it, so the line stays flat
 * until the next sale instead of dipping or leaving a gap. That is what TCGplayer's own market price
 * does between two sales, and what Bart asked the chart to do (2026-09-15). A figure with nothing
 * before it stays out.
 *
 * @param {{ card: string, date: string, real: Record<string, number>, legacy: Record<string, number> }[]} days
 * @param {Taken[]} taken
 */
function holdLastFigure(days, taken) {
  if (!taken.length) return;
  const wanted = new Set(taken.map((t) => `${t.card}|${t.printing}`));
  /** @type {Map<string, { date: string, value: number }[]>} */
  const kept = new Map();
  for (const d of days) {
    for (const figures of [d.real, d.legacy]) {
      for (const [printing, value] of Object.entries(figures)) {
        const key = `${d.card}|${printing}`;
        if (!wanted.has(key)) continue;
        const list = kept.get(key) ?? [];
        list.push({ date: d.date, value });
        kept.set(key, list);
      }
    }
  }
  for (const list of kept.values()) list.sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const t of taken) {
    const list = kept.get(`${t.card}|${t.printing}`) ?? [];
    let before = null;
    for (const k of list) {
      if (k.date >= t.date) break;
      before = k.value;
    }
    if (before == null) continue;
    t.figures[t.printing] = before;
    t.held[t.printing] = t.value;
  }
}

/**
 * Rows laid out as days, one per card per date with a figure, from `since` on, oldest first. A card
 * is its catalogue and its id: an English and a Japanese card under one id are two lines.
 *
 * Each day carries its printings and the two series every chart and line has read (`market`, the
 * plain run before the foil, and `holo`, the foil), in the order pointFromTcgplayer takes them. A
 * day with only the old series has those and no printings.
 *
 * @param {{ language: PriceLanguage, tcg_id: string, printing: string, month: string, cents: (number | null)[] | null }[]} rows
 * @param {string} [since] yyyy-mm-dd
 * @returns {DayPrices[]}
 */
export function daysFromMonths(rows, since = "0000-00-00") {
  /** @type {Map<string, { language: PriceLanguage, card: string, tcgId: string, date: string, real: Record<string, number>, legacy: Record<string, number>, held: Record<string, number> }>} */
  const days = new Map();
  for (const row of rows) {
    const language = languageOrThrow(row.language);
    const card = historyKey(language, row.tcg_id);
    const prefix = row.month.slice(0, 8);
    const year = Number(row.month.slice(0, 4));
    const length = new Date(Date.UTC(year, Number(row.month.slice(5, 7)), 0)).getUTCDate();
    const isLegacy = row.printing === LEGACY.market || row.printing === LEGACY.holo;
    for (let i = 0; i < length; i++) {
      const c = row.cents?.[i];
      if (c == null) continue;
      const date = `${prefix}${String(i + 1).padStart(2, "0")}`;
      const key = `${card}|${date}`;
      let day = days.get(key);
      if (!day)
        days.set(
          key,
          (day = { language, card, tcgId: row.tcg_id, date, real: {}, legacy: {}, held: {} }),
        );
      (isLegacy ? day.legacy : day.real)[row.printing] = c / 100;
    }
  }
  /* Judged on every day read, the days before `since` too: they are the neighbours the first days
     after it are weighed against, and the last figure a stray one right after it holds. */
  /** @type {Taken[]} */
  const taken = [];
  dropScarcerRunsUnderTheirBase([...days.values()], taken);
  dropStrayFigures([...days.values()], taken);
  holdLastFigure([...days.values()], taken);
  for (const [key, d] of days) {
    if (d.date < since || (!Object.keys(d.real).length && !Object.keys(d.legacy).length))
      days.delete(key);
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
    const c = counts.get(d.card) ?? {};
    for (const name of Object.keys(d.real)) c[name] = (c[name] ?? 0) + 1;
    counts.set(d.card, c);
  }
  /** @param {Record<string, number>} c @param {string[]} names */
  const lineOf = (c, names) => {
    const most = Math.max(0, ...names.map((n) => c[n] ?? 0));
    return most ? (names.find((n) => (c[n] ?? 0) * 2 >= most) ?? null) : null;
  };
  /** @type {Map<string, { plain: string | null, foil: string | null }>} */
  const lines = new Map(
    [...counts].map(([card, c]) => {
      /* The plain line only where it is the card's own: a printing read on at least half as many
         days as the card's most-read printing of any kind. ex8-15's 95 days of "normal" beside
         306 of holofoil made its line the scattered plain one (pricing audit, 2026-09-14). */
      const most = Math.max(0, ...Object.values(c));
      const plain = lineOf(c, PLAIN);
      return [
        card,
        { plain: plain && (c[plain] ?? 0) * 2 >= most ? plain : null, foil: lineOf(c, FOIL) },
      ];
    }),
  );
  const out = [];
  for (const d of days.values()) {
    if (Object.keys(d.real).length) {
      const line = lines.get(d.card) ?? { plain: null, foil: null };
      const foil = line.foil ? (d.real[line.foil] ?? null) : null;
      const plain = line.plain ? (d.real[line.plain] ?? null) : null;
      out.push({
        language: d.language,
        tcgId: d.tcgId,
        date: d.date,
        market: line.plain ? plain : foil,
        holo: foil,
        printings: d.real,
        ...(Object.keys(d.held).some((k) => k in d.real) ? { held: d.held } : {}),
      });
    } else {
      const market = d.legacy[LEGACY.market] ?? null;
      out.push({
        language: d.language,
        tcgId: d.tcgId,
        date: d.date,
        market,
        holo: d.legacy[LEGACY.holo] ?? null,
      });
    }
  }
  return out.sort((a, b) =>
    a.date < b.date
      ? -1
      : a.date > b.date
        ? 1
        : a.tcgId < b.tcgId
          ? -1
          : a.tcgId > b.tcgId
            ? 1
            : a.language < b.language
              ? -1
              : 1,
  );
}

/** The first of the month a date falls in, for a query on `month`. */
export const monthOf = (/** @type {string} */ date) => `${date.slice(0, 7)}-01`;
