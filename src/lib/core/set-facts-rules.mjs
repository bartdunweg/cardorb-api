/**
 * A set's name and release day resolved from the sources, apart from the fetching, so a test can
 * hold it (set-facts-rules.test.ts) and scripts/data-health.mjs can run it.
 *
 * On 2026-09-14 every set was laid beside TCGplayer and Scrydex by hand, and where both agreed
 * against TCGdex the copy was put right (set-corrections.ts). A set published after that day was
 * never looked at: this is the same comparison for every set, every time data-health runs
 * (R-DATA-004). Since 2026-09-17 the comparison is the shared consensus rule (consensus.mjs) rather
 * than a rule of its own: TCGdex, TCGplayer, Scrydex and Bulbapedia vote, the biases each of them is
 * known to have are declared exceptions that take its vote away, and a majority decides. A tie or a
 * three-way split changes nothing and is reported with what each source said.
 *
 * Plain JavaScript, because the script runs on plain node and cannot import TypeScript.
 */
import { explain, resolve, subsetName } from "./consensus.mjs";

/**
 * Scrydex's English expansions table (https://scrydex.com/pokemon/expansions): each row's code, name
 * and release date. Japanese rows (codes ending in _ja) are left out.
 *
 * @param {string} html
 * @returns {{ code: string, name: string, date: string }[]}
 */
export function scrydexExpansions(html) {
  const rows = [];
  for (const m of html.matchAll(
    /data-url="\/pokemon\/expansions\/[^"/]+\/([^"/]+)"><td[^>]*>.*?<span[^>]*>([^<]+)<\/span><\/div><\/td><td[^>]*><span[^>]*>[^<]*<\/span><\/td><td[^>]*><span[^>]*>\d+<\/span><\/td><td[^>]*><span[^>]*>(\d{4})\/(\d{2})\/(\d{2})<\/span>/g,
  )) {
    if (m[1].endsWith("_ja")) continue;
    rows.push({ code: m[1], name: decodeEntities(m[2].trim()), date: `${m[3]}-${m[4]}-${m[5]}` });
  }
  return rows;
}

const decodeEntities = (s) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"');

/** A TCGplayer group's name without its code: "SV01: Scarlet & Violet Base Set" is the part after. */
export const groupTitle = (name) => String(name).replace(/^[A-Za-z0-9.]+:\s*/, "");

/** A name as the three are compared: accents, case, "&" and punctuation aside. */
export const nameKey = (name) =>
  String(name ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");

/** A date as YYYY-MM-DD, from the copy's "2019/01/31" or TCGplayer's "2019-02-01T00:00:00". */
export const dayOf = (date) => (date ? String(date).slice(0, 10).replaceAll("/", "-") : null);

/**
 * The copy's facts of one set the sources decide otherwise, each as `{ stored, value, why }`.
 *
 * The answers are given as they come: TCGdex's own record, TCGplayer's group (its era prefix
 * dropped), Scrydex's expansion row, and Bulbapedia's day where scripts/release-dates.mjs has read
 * one. A source with nothing to say is left out. Nothing is flagged unless a majority of the sources
 * that do vote say the same other thing, so the copy stands wherever they are split.
 *
 * @param {{ id?: string, name: string, release_date: string | null, serie_id?: string | null }} set
 * @param {{ name: string, publishedOn: string } | undefined | null} group TCGplayer's group
 * @param {{ name: string, date: string } | undefined | null} expansion Scrydex's expansion
 * @param {{ tcgdex?: { name?: string | null, releaseDate?: string | null } | null,
 *           bulbapediaDate?: string | null, promo?: boolean }} [others]
 * @returns {{ name?: { stored: string, value: string, why: string },
 *             date?: { stored: string | null, value: string, why: string } }}
 */
export function setFactsAgainst(set, group, expansion, others = {}) {
  const subject = {
    setId: set.id ?? null,
    series: set.serie_id ?? null,
    promo: others.promo === true,
  };
  const out = {};

  const name = resolve("set.name", subject, {
    tcgdex: others.tcgdex?.name ?? null,
    tcgplayer: group ? groupTitle(group.name) : null,
    scrydex: expansion?.name ?? null,
  });
  if (name.value != null && nameKey(name.value) !== nameKey(set.name))
    out.name = { stored: set.name, value: subsetName(name.value), why: explain(name) };

  const date = resolve("set.releaseDate", subject, {
    tcgdex: dayOf(others.tcgdex?.releaseDate),
    tcgplayer: dayOf(group?.publishedOn),
    scrydex: expansion?.date ?? null,
    bulbapedia: dayOf(others.bulbapediaDate),
  });
  if (date.value && date.value !== dayOf(set.release_date))
    out.date = { stored: set.release_date, value: date.value, why: explain(date) };

  return out;
}

/**
 * Each set's TCGplayer group: the one most of its linked cards' products are in.
 *
 * @param {Record<string, { productId?: number, groupId?: number } | null>} links
 * @param {Record<string, number>} groupOfProduct
 * @returns {Map<string, number>}
 */
export function groupsOfSets(links, groupOfProduct) {
  const votes = new Map();
  for (const [id, link] of Object.entries(links)) {
    const group =
      link?.groupId ?? (link?.productId != null ? groupOfProduct[link.productId] : null);
    if (group == null) continue;
    const set = id.slice(0, id.lastIndexOf("-"));
    const counts = votes.get(set) ?? new Map();
    counts.set(group, (counts.get(group) ?? 0) + 1);
    votes.set(set, counts);
  }
  return new Map(
    [...votes].map(([set, counts]) => [set, [...counts].sort((a, b) => b[1] - a[1])[0][0]]),
  );
}
