/**
 * A set's name and release date held to TCGplayer's group and Scrydex's expansion, apart from the
 * fetching, so a test can hold it (set-facts-rules.test.ts) and scripts/data-health.mjs can run it.
 *
 * On 2026-09-14 every set was laid beside both by hand, and where both agreed against TCGdex the
 * copy was put right (set-corrections.ts). A set published after that day was never looked at: this
 * is the same comparison for every set, every time data-health runs (R-DATA-004). A fact is flagged
 * only where TCGplayer and Scrydex say the same thing and the copy says another; where the two
 * disagree with each other, nobody has a better answer than the copy.
 *
 * Plain JavaScript, because the script runs on plain node and cannot import TypeScript.
 */

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
 * The copy's facts of one set that TCGplayer and Scrydex agree against, each as [copy, theirs].
 *
 * @param {{ name: string, release_date: string | null }} set the copy's set
 * @param {{ name: string, publishedOn: string } | undefined} group TCGplayer's group
 * @param {{ name: string, date: string } | undefined} expansion Scrydex's expansion
 * @returns {{ name?: [string, string], date?: [string | null, string] }}
 */
export function setFactsAgainst(set, group, expansion) {
  const out = {};
  if (!group || !expansion) return out;
  const title = groupTitle(group.name);
  if (nameKey(title) === nameKey(expansion.name) && nameKey(title) !== nameKey(set.name))
    out.name = [set.name, expansion.name];
  const day = dayOf(group.publishedOn);
  if (day && day === expansion.date && day !== dayOf(set.release_date))
    out.date = [set.release_date, day];
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
