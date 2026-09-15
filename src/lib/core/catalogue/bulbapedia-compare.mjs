/**
 * One set of the copy beside Bulbapedia's list of it: every difference in its name, its size, and
 * each card's number and name.
 *
 * Both comparisons are made and both are reported: exact, which is what the page shows, and folded
 * (nameKey, numberKey), which tells a spelling from a naming. "Mewtwo ★" beside "Mewtwo ☆" is a
 * spelling; "Imposter Professor Oak" beside "Impostor Professor Oak" is a name. Pure, so the script
 * and the test read the same rules (scripts/bulbapedia-compare.mjs does the fetching).
 */

import { nameKey, numberKey } from "./bulbapedia-setlist.mjs";

/**
 * @typedef {{ kind: string, language: string, set: string, card?: string, number?: string, ours: string, bulbapedia: string }} Difference
 *
 * Kinds, in the order the report lists them:
 *   set name, set name spelling, Japanese set name, set total, printed total,
 *   missing card (Bulbapedia lists it, the copy has no card at that number),
 *   extra card (the copy has a card Bulbapedia's list does not),
 *   card name, card name spelling, number spelling (one a set)
 */
export const KINDS = [
  "list not found",
  "set name",
  "set name spelling",
  "Japanese set name",
  "set total",
  "printed total",
  "missing card",
  "extra card",
  "card name",
  "card name spelling",
  "number spelling",
];

/** The most common value, or null for none. */
function mode(values) {
  const counts = new Map();
  for (const v of values) if (v != null) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = null;
  let n = 0;
  for (const [v, c] of counts)
    if (c > n) {
      best = v;
      n = c;
    }
  return best;
}

/**
 * The one mark two code points draw alike: the Prism Star is ◇ in the copy and ♢ on Bulbapedia's
 * lists, and neither is a naming or a spelling of the card, which prints a star in a diamond.
 */
const sameMarks = (s) => String(s ?? "").replace(/♢/g, "◇");

/**
 * An entry's name as the list shows it, whole: Unseen Forces' Unown carry their letter only in the
 * number ("Unown", B) where the card prints "Unown B".
 */
const listedName = (e) =>
  e.name === "Unown" && /^[A-Z!?]$/.test(e.number ?? "") ? `Unown ${e.number}` : e.name;

/**
 * The name to hold a card's against: the entry's own, or with the small print after it where that
 * is the card's form or subtitle ("Gastrodon" East Sea, "Professor's Research" [Professor Magnolia])
 * and the copy's name carries it.
 */
function theirNameFor(e, ours) {
  const name = listedName(e);
  if (!e.note) return name;
  const full = `${name} ${e.note}`;
  return nameKey(full) === nameKey(ours) ? full : name;
}

/**
 * Every card Bulbapedia lists for the set: its own lists' entries, and the cards of it another page
 * lists among cards of many sets (Yellow A Alternate cards) where its own lists do not hold them.
 *
 * @param {{ found: ({ entries: { number: string|null, name: string }[] } | undefined)[], alternates?: { number: string|null, name: string }[] }} bulbapedia
 */
export function listedEntries(bulbapedia) {
  const own = bulbapedia.found.flatMap((l) => l?.entries ?? []);
  const alternates = (bulbapedia.alternates ?? []).filter(
    (a) =>
      !own.some(
        (e) =>
          numberKey(e.number) === numberKey(a.number) && nameKey(listedName(e)) === nameKey(a.name),
      ),
  );
  return [...own, ...alternates];
}

/** Japanese text folded for comparison: width, spaces and the dots between words. */
const jaKey = (s) =>
  String(s ?? "")
    .normalize("NFKC")
    .replace(/[\s・•]/g, "")
    .toLowerCase();

/**
 * @param {{ language: string, id: string, name: string, local_name?: string|null, total?: number|null, printed_total?: number|null }} set
 * @param {{ id: string, local_id: string, name: string }[]} cards the copy's cards of the set
 * @param {{ lists: string[], found: ({ title: string, entries: { number: string|null, printedTotal: string|null, name: string, note?: string }[] } | undefined)[], alternates?: { number: string|null, printedTotal: string|null, name: string }[], jasetname?: string|null }} bulbapedia the mapping's list references, the list each names (undefined where the page has none), and the set's cards listed on a page of many sets
 * @returns {Difference[]}
 */
export function compareSet(set, cards, bulbapedia) {
  const out = [];
  const base = { language: set.language, set: set.id };
  const add = (d) => out.push({ ...base, ...d });

  bulbapedia.lists.forEach((ref, i) => {
    if (!bulbapedia.found[i]?.entries.length)
      add({ kind: "list not found", ours: set.name, bulbapedia: `no list "${ref}" on the page` });
  });
  const entries = listedEntries(bulbapedia);
  if (!entries.length) return out;

  // The set's name, where one list is the set: a subset the copy names after its parent ("Crown
  // Zenith Galarian Gallery" for "Galarian Gallery") says the same thing more fully.
  // A trainer kit's half deck is the kit's name with the deck's Pokémon: "XY Trainer Kit (Latias)"
  // for Bulbapedia's "Latias Half Deck".
  if (bulbapedia.found.length === 1) {
    const theirs = bulbapedia.found[0].title;
    const deck = / Half Deck$/.test(theirs) ? ` (${theirs.replace(/ Half Deck$/, "")})` : null;
    if (
      set.name !== theirs &&
      !set.name.endsWith(` ${theirs}`) &&
      !(deck && / Trainer Kit( \d)?\b/.test(set.name) && set.name.endsWith(deck))
    )
      add({
        kind: nameKey(set.name) === nameKey(theirs) ? "set name spelling" : "set name",
        ours: set.name,
        bulbapedia: theirs,
      });
  }

  if (set.language === "ja" && set.local_name && bulbapedia.jasetname) {
    const ours = jaKey(set.local_name);
    const parts = bulbapedia.jasetname.split(/[•・]\s|\s[•・]/).map(jaKey);
    if (!parts.some((p) => p && (p === ours || p.includes(ours) || ours.includes(p))))
      add({ kind: "Japanese set name", ours: set.local_name, bulbapedia: bulbapedia.jasetname });
  }

  if (set.total != null && set.total !== entries.length)
    add({ kind: "set total", ours: String(set.total), bulbapedia: String(entries.length) });

  // By its digits: a subset prints "TG30" where the copy counts 30.
  const printed = mode(entries.map((e) => e.printedTotal));
  const digits = (n) => String(Number(/\d+/.exec(String(n))?.[0]));
  if (
    printed &&
    /\d/.test(printed) &&
    set.printed_total &&
    digits(printed) !== digits(set.printed_total)
  )
    add({ kind: "printed total", ours: String(set.printed_total), bulbapedia: printed });

  // A set the copy holds no card of is one difference, not one per card.
  if (!cards.length) {
    add({ kind: "missing card", ours: "no cards", bulbapedia: `${entries.length} cards` });
    return out;
  }

  // Cards by number first; what is left of an unnumbered list is paired by name.
  const theirsByNumber = new Map();
  const unnumbered = [];
  for (const e of entries) {
    if (e.number == null) unnumbered.push(e);
    else {
      const k = numberKey(e.number);
      theirsByNumber.set(k, [...(theirsByNumber.get(k) ?? []), e]);
    }
  }
  const leftOurs = [];
  const spelt = [];
  const sorted = [...cards].sort((a, b) =>
    a.local_id.localeCompare(b.local_id, "en", { numeric: true }),
  );
  for (const card of sorted) {
    const k = numberKey(card.local_id);
    const candidates = theirsByNumber.get(k);
    if (!candidates?.length) {
      leftOurs.push(card);
      continue;
    }
    const i = Math.max(
      0,
      candidates.findIndex((e) => nameKey(theirNameFor(e, card.name)) === nameKey(card.name)),
    );
    const [theirs] = candidates.splice(i, 1);
    const theirName = theirNameFor(theirs, card.name);
    const at = { card: card.id, number: card.local_id };
    if (theirs.number !== card.local_id) spelt.push([card.local_id, theirs.number]);
    if (nameKey(theirName) !== nameKey(card.name))
      add({ kind: "card name", ...at, ours: card.name, bulbapedia: theirName });
    else if (sameMarks(theirName) !== sameMarks(card.name))
      add({ kind: "card name spelling", ...at, ours: card.name, bulbapedia: theirName });
  }
  // Numbers spelt another way ("1" beside "001") are one difference a set, with its first examples.
  if (spelt.length) {
    const sample = (i) =>
      spelt
        .slice(0, 3)
        .map((p) => p[i])
        .join(", ") + (spelt.length > 3 ? ` and ${spelt.length - 3} more` : "");
    add({ kind: "number spelling", ours: sample(0), bulbapedia: sample(1) });
  }
  const extra = [];
  for (const card of leftOurs) {
    const i = unnumbered.findIndex(
      (e) => nameKey(theirNameFor(e, card.name)) === nameKey(card.name),
    );
    if (i >= 0) {
      const [theirs] = unnumbered.splice(i, 1);
      const theirName = theirNameFor(theirs, card.name);
      if (sameMarks(theirName) !== sameMarks(card.name))
        add({
          kind: "card name spelling",
          card: card.id,
          number: card.local_id,
          ours: card.name,
          bulbapedia: theirName,
        });
    } else extra.push(card);
  }
  for (const e of [...[...theirsByNumber.values()].flat(), ...unnumbered])
    add({
      kind: "missing card",
      number: e.number ?? "",
      ours: "",
      bulbapedia: e.number ? `${e.number} ${listedName(e)}` : e.name,
    });
  for (const card of extra)
    add({
      kind: "extra card",
      card: card.id,
      number: card.local_id,
      ours: `${card.local_id} ${card.name}`,
      bulbapedia: "",
    });
  return out;
}

/** Whether a difference is one the accepted list keeps, matched on every field it names. */
export function isAccepted(d, accepted) {
  return accepted.some(
    (a) =>
      a.kind === d.kind &&
      a.language === d.language &&
      a.set === d.set &&
      (a.number == null || a.number === (d.number ?? "")) &&
      a.ours === d.ours &&
      a.bulbapedia === d.bulbapedia,
  );
}
