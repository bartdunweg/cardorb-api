/**
 * The rules scripts/reverse-holo-evidence.mjs decides a plain reverse holo by, apart from the
 * fetching, so a test can hold them (reverse-holo-rules.test.ts).
 *
 * Plain JavaScript, like price-basis.mjs, because the script runs on plain node and cannot import
 * TypeScript.
 */

/**
 * The day the first reverse holos were sold: Legendary Collection, 24 May 2002. Bulbapedia,
 * "Holofoil": "Legendary Collection was the first set to include Reverse Holographic cards", and on
 * its own page: "Legendary Collection introduced Reverse Holofoil prints". A card sold before it has
 * no plain reverse, whatever a catalogue files it as: Southern Islands' six foil cards are holos
 * TCGplayer lists under "Reverse Holofoil" and TCGdex as a reverse, and Scrydex as holofoil.
 */
export const FIRST_REVERSE_DAY = "2002-05-24";

/**
 * Wizards Black Star Promos run from 1999 to 2003 in one set, so the era is read per card: numbers
 * 1 to 46 came out by May 2002 (Bulbapedia's set list: 46 is the Pokémon League card of May 2002,
 * 47 of June 2002).
 */
const BEFORE_REVERSES_BY_NUMBER = { basep: 46 };

/** A release date as the copy stores it ("2002/05/24") or as ISO, compared as ISO. */
const iso = (d) => (d ? String(d).replaceAll("/", "-").slice(0, 10) : null);

/**
 * Whether a card was sold before reverse holos existed.
 *
 * @param {{ set_id: string, local_id: string }} card
 * @param {string | null | undefined} released its set's release date
 * @returns {boolean}
 */
export function beforeReverseHolos(card, released) {
  const last = BEFORE_REVERSES_BY_NUMBER[card.set_id];
  if (last != null) {
    const n = Number(String(card.local_id).replace(/\D/g, ""));
    return Number.isFinite(n) && n > 0 && n <= last;
  }
  const day = iso(released);
  return day != null && day < FIRST_REVERSE_DAY;
}

/** A basic Energy card, the one kind every set prints several of alike. */
export const isBasicEnergy = (card) =>
  /^(Grass|Fire|Water|Lightning|Psychic|Fighting|Darkness|Metal|Fairy) Energy$/.test(card.name);

/**
 * @typedef {object} Witnessed
 * @property {{ id: string, set_id: string, local_id: string, name: string, rarity: string | null }} card
 * @property {boolean | null} tcgdex
 * @property {boolean | null} tcgplayer
 * @property {boolean | null} scrydex
 */

/**
 * Which basic Energies of a set are one kind, printed alike: the same rarity, and the same run where
 * the set holds a name more than once. Emerald's Darkness and Metal Energy (Rare, with their own
 * rules) are not its six Holo Rare basics; Scarlet & Violet Energy holds three runs of eight, each
 * a Grass to Metal of its own.
 *
 * @param {Witnessed["card"][]} cards the set's basic Energies
 * @returns {Map<string, string>} card id to its kind
 */
export function energyKinds(cards) {
  const seen = new Map();
  const out = new Map();
  const byNumber = [...cards].sort(
    (a, b) =>
      Number(String(a.local_id).replace(/\D/g, "")) - Number(String(b.local_id).replace(/\D/g, "")),
  );
  for (const c of byNumber) {
    const key = `${c.rarity ?? ""}|${c.name}`;
    const run = (seen.get(key) ?? 0) + 1;
    seen.set(key, run);
    out.set(c.id, `${c.rarity ?? "no rarity"} basic Energy, run ${run}`);
  }
  return out;
}

/**
 * One set's decisions.
 *
 * - A card sold before Legendary Collection has no plain reverse (beforeReverseHolos).
 * - Where Bulbapedia names the cards one by one (`decides`), it decides.
 * - A basic Energy is decided with the others of its kind (energyKinds): the majority of every
 *   witness's answer over all of them, and on a tie the majority of Bulbapedia's answers for them. A
 *   card leaves its kind only where every witness that answers for it, at least two, says otherwise.
 *   One or two noisy answers split nothing: Diamond & Pearl's Darkness Energy had TCGplayer and
 *   Scrydex against TCGdex, its Fire Energy Scrydex alone.
 * - Every other card: the majority of TCGdex, TCGplayer and Scrydex that answer; on a tie,
 *   Bulbapedia's rule; without one, TCGdex's word.
 *
 * @param {Witnessed[]} rows the set's cards
 * @param {{ released?: string | null, bulbapedia: (card: Witnessed["card"]) => { has: boolean, decides?: boolean, rule: string } | null }} context
 * @returns {{ decisions: Record<string, boolean>, disputed: string[], exceptions: string[], era: boolean, rule: string | null }}
 */
export function decideSet(rows, { released = null, bulbapedia }) {
  /** @type {Record<string, boolean>} */
  const decisions = {};
  const disputed = [];
  const exceptions = [];
  let rule = null;
  let era = false;
  const flag = (v) => (v == null ? "-" : v ? "1" : "0");
  const votesOf = (w) => [w.tcgdex, w.tcgplayer, w.scrydex].filter((v) => v != null);
  const note = (w, b, has, why) =>
    disputed.push(
      `${w.card.id} tcgdex ${flag(w.tcgdex)} tcgplayer ${flag(w.tcgplayer)} scrydex ${flag(w.scrydex)} bulbapedia ${flag(b?.has)}: ${has ? "yes" : "no"}${why ? ` (${why})` : ""}`,
    );

  const kindOf = energyKinds(rows.filter((w) => isBasicEnergy(w.card)).map((w) => w.card));
  const groups = new Map();
  for (const w of rows) {
    const kind = kindOf.get(w.card.id);
    if (!kind || !votesOf(w).length) continue;
    const g = groups.get(kind) ?? { yes: 0, no: 0, bYes: 0, bNo: 0 };
    for (const v of votesOf(w)) v ? g.yes++ : g.no++;
    const b = bulbapedia(w.card);
    if (b) b.has ? g.bYes++ : g.bNo++;
    groups.set(kind, g);
  }
  const groupHas = (kind) => {
    const g = groups.get(kind);
    return g.yes !== g.no ? g.yes > g.no : g.bYes !== g.bNo ? g.bYes > g.bNo : g.yes > 0;
  };

  for (const w of rows) {
    const b = bulbapedia(w.card);
    rule ??= b?.rule ?? null;
    const votes = votesOf(w);
    const yes = votes.filter(Boolean).length;
    const no = votes.length - yes;
    if (beforeReverseHolos(w.card, released)) {
      era = true;
      decisions[w.card.id] = false;
      if (yes) note(w, b, false, "sold before Legendary Collection");
      continue;
    }
    if (!votes.length) continue;
    const kind = kindOf.get(w.card.id);
    let has;
    let why = null;
    if (b?.decides) has = b.has;
    else if (kind) {
      const group = groupHas(kind);
      const unanimous = votes.length >= 2 && (yes === 0 || no === 0);
      has = unanimous ? yes > 0 : group;
      if (has !== group) exceptions.push(w.card.id);
      else if (yes && no) why = `decided with the set's ${kind}`;
    } else has = yes !== no ? yes > no : (b?.has ?? w.tcgdex ?? yes > 0);
    decisions[w.card.id] = has;
    if ((yes && no) || (b?.decides && votes.some((v) => v !== b.has))) note(w, b, has, why);
  }
  return { decisions, disputed, exceptions, era, rule };
}

/**
 * Cards of one kind in one set decided apart: the same rarity, or the H cards of an e-Card set,
 * with and without a plain reverse. Reported by the script, not decided: a rarity is not a kind of
 * printing (a Rare and a Rare Holo share it in the WotC era).
 *
 * @param {Witnessed[]} rows
 * @param {Record<string, boolean>} decisions
 * @returns {{ kind: string, yes: string[], no: string[] }[]}
 */
export function splitKinds(rows, decisions) {
  const kinds = new Map();
  for (const w of rows) {
    const has = decisions[w.card.id];
    if (has == null) continue;
    const kind = /^H\d/i.test(w.card.local_id) ? "H cards" : (w.card.rarity ?? "no rarity");
    const entry = kinds.get(kind) ?? { kind, yes: [], no: [] };
    (has ? entry.yes : entry.no).push(w.card.id);
    kinds.set(kind, entry);
  }
  return [...kinds.values()].filter((k) => k.yes.length && k.no.length);
}

/**
 * The linked cards the evidence run has not decided, counted per set: a set published after the run
 * (30th Celebration and its Classic Collection on 2026-09-17), whose cards offer the printings
 * card-printings.ts guessed before the witnesses. A card the run found its witnesses split on is
 * decided; a card with no TCGplayer link is one no witness but TCGdex can answer for.
 *
 * @param {{ id: string, set_id: string }[]} cards the copy's cards
 * @param {Record<string, { productId?: number } | null>} links tcgplayer-ids.generated.json
 * @param {Record<string, boolean>} decisions reverse-holo.generated.json's cards
 * @param {Set<string>} disputed card ids the run found the witnesses split on
 * @returns {Map<string, number>}
 */
export function undecidedLinkedCards(cards, links, decisions, disputed) {
  const bySet = new Map();
  for (const c of cards) {
    if (c.id in decisions || disputed.has(c.id) || !links[c.id]?.productId) continue;
    bySet.set(c.set_id, (bySet.get(c.set_id) ?? 0) + 1);
  }
  return bySet;
}

/** TCGdex's variant types as this app's finishes. */
const TCGDEX_FINISH = { normal: "normal", holo: "holo", reverse: "reverse-holo" };

/**
 * The finishes a card offers from TCGdex's variants once the evidence run's holo decisions are
 * applied, as card-printings.ts applies them: a holo filed as a normal (holoNotNormal), a holo beside
 * the normal (holoBesideNormal), a pre-reverse holo filed as a reverse (holoBeforeReverses), a plain
 * card filed as a holo (normalNotHolo).
 *
 * @param {{ id: string, variants?: { type?: string }[] | null }} card
 * @param {{ holoNotNormal?: string[], holoBesideNormal?: string[], holoBeforeReverses?: string[], normalNotHolo?: string[] }} decided
 * @returns {Set<string>}
 */
export function tcgdexFinishesOf(card, decided) {
  const out = new Set();
  const instead = decided.holoNotNormal?.includes(card.id);
  const beside = decided.holoBesideNormal?.includes(card.id);
  const before = decided.holoBeforeReverses?.includes(card.id);
  const plain = decided.normalNotHolo?.includes(card.id);
  for (const v of card.variants ?? []) {
    let finish = TCGDEX_FINISH[v.type ?? ""];
    if (!finish) continue;
    if (finish === "normal" && instead) finish = "holo";
    if (finish === "reverse-holo" && before) finish = "holo";
    else if (finish === "holo" && plain) finish = "normal";
    out.add(finish);
    if (finish === "normal" && beside) out.add("holo");
  }
  return out;
}

/**
 * The plain finishes a TCGplayer link names ("1st-edition-holofoil" is a holo, "unlimited" a normal).
 * Patterned prints are other products and name nothing here.
 *
 * @param {{ variants?: string[] } | null | undefined} link
 * @returns {Set<string>}
 */
export function tcgplayerFinishesOf(link) {
  const out = new Set();
  for (const v of link?.variants ?? []) {
    const bare = v.replace(/^(1st-edition|unlimited)(-|$)/, "") || "normal";
    const finish = { normal: "normal", holofoil: "holo", "reverse-holofoil": "reverse-holo" }[bare];
    if (finish) out.add(finish);
  }
  return out;
}

/**
 * Per set, the linked cards whose finishes after the evidence rules share nothing with what
 * TCGplayer sells of them. 30th Celebration on 2026-09-17: TCGdex said normal for all 188 cards,
 * TCGplayer sold every one as Holofoil only, and a form offered each a Standard copy. A card either
 * side names no finish for is not compared.
 *
 * @param {{ id: string, set_id: string, variants?: { type?: string }[] | null }[]} cards
 * @param {Record<string, { variants?: string[] } | null>} links tcgplayer-ids.generated.json
 * @param {Parameters<typeof tcgdexFinishesOf>[1]} decided reverse-holo.generated.json
 * @returns {Map<string, { compared: number, disjoint: string[] }>}
 */
export function disjointFinishesBySet(cards, links, decided) {
  const bySet = new Map();
  for (const c of cards) {
    const ours = tcgdexFinishesOf(c, decided);
    const theirs = tcgplayerFinishesOf(links[c.id]);
    if (!ours.size || !theirs.size) continue;
    const entry = bySet.get(c.set_id) ?? { compared: 0, disjoint: [] };
    entry.compared++;
    if (![...ours].some((f) => theirs.has(f))) entry.disjoint.push(c.id);
    bySet.set(c.set_id, entry);
  }
  return bySet;
}
