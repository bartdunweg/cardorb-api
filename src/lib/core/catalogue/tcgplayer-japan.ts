/**
 * TCGplayer's Japanese shelf as a catalogue: the cards of a set TCGdex lists without cards, and the
 * picture of a card TCGdex and Limitless have none of.
 *
 * Measured 2026-09-14 on the copy: TCGdex lists 53 of its 169 Japanese sets with no card behind
 * them (Shiny Star V, Eevee Heroes, the 25th Anniversary Collection, every SM+ set) and has no
 * picture for 2,430 of the 12,781 cards it does list, most of them PMCG, neo, e-Card, VS and PCG.
 * TCGplayer sells the Japanese shelf (tcgcsv category 85, 459 groups) and lists each of those sets'
 * cards with a number, an English name, its rarity, type, HP and stage, and a product picture.
 * The prices already come from there (tcgplayer_prices), so this is the same source, not a new one.
 *
 * A set is found by hand where code and title both miss (GROUP_BY_HAND), by code next ("S4a: Shiny
 * Star V" is TCGdex's S4a) and by its English title otherwise (the vintage groups carry no code:
 * "Base Expansion Pack" is E1). A card is found by its number, where the name agrees, and by its
 * English name where TCGplayer prints no number (PMCG and neo are unnumbered there).
 */
import SPECIES from "../pokedex.generated.json";
import { catalogueTimeout } from "../util";

const BASE = "https://tcgcsv.com/tcgplayer/85";

type Group = { groupId: number; name: string; abbreviation?: string | null };
type Product = {
  productId: number;
  name: string;
  extendedData?: { name: string; value: string }[];
};

/** One card of a TCGplayer group: its base product, with what the product says about it. */
export type TcgplayerJapanCard = {
  productId: number;
  /** The printed number before the slash ("003" of "003/190"); null where TCGplayer lists none. */
  number: string | null;
  /** The printed number after the slash ("190" of "003/190"); null where there is none. */
  total?: string | null;
  /** The English name, without the number and the printing TCGplayer adds to a product's name. */
  name: string;
  /**
   * A bracketed label that makes the product a card of its own rather than a printing of one:
   * "HR" and "U" for neo2's two Houndour, "West Sea" for Gastrodon. Null for a plain card.
   */
  label?: string | null;
  rarity: string | null;
  cardType: string | null;
  hp: number | null;
  stage: string | null;
  /** TCGplayer's 1000 px product picture. */
  image: string;
};

async function read<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { accept: "application/json", "User-Agent": "cardorb.com" },
    signal: catalogueTimeout(),
  });
  if (!res.ok) throw new Error(`tcgcsv ${url}: ${res.status}`);
  return (await res.json()) as T;
}

/** Lowercase letters and digits only, accents folded: "Pokémon Card VS" and "Pokemon Card VS" are one title. */
const fold = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const extended = (p: Product, name: string) =>
  p.extendedData?.find((e) => e.name === name)?.value ?? null;

/** The printed number TCGplayer writes into a product's name: " - 003/190". */
const NUMBER_IN_NAME = /\s+-\s+[A-Za-z0-9-]*\d+\/[A-Za-z0-9-]+(?=\s*(?:\(|$))/g;

/**
 * "Charizard V - 003/190 (Mirror Holofoil)" is Charizard V; the number and the labels in brackets
 * at the end are the product's. TCGplayer writes the number after the label too: "Larry's
 * Efficiency (Mirror Foil) - 162/187" (SV8a).
 */
export const cardName = (productName: string) =>
  productName
    .replace(NUMBER_IN_NAME, "")
    .replace(/(?:\s*\([^)]*\))+\s*$/, "")
    .trim();

/** A product's labels in brackets at the end of its name, in order: ["CoroCoro …", "Jumbo"]. */
const labelsOf = (productName: string) =>
  [
    ...(/(?:\s*\([^)]*\))+\s*$/.exec(productName.replace(NUMBER_IN_NAME, ""))?.[0] ?? "").matchAll(
      /\(([^)]*)\)/g,
    ),
  ].map((m) => m[1]!.trim());

/**
 * The bracketed labels that are a printing of a card TCGplayer also sells plain: the foils and the
 * ball patterns. Every other label names a card of its own. On 2026-09-14 the copy read any label
 * as a printing and kept one product per number or name, so neo2's Houndour (HR) and Houndour (U),
 * two cards, were one, and a City Gym deck's (LV.12) and (LV.15) Bellsprout too.
 */
const PRINTING_LABEL =
  /^(?:mirror (?:holofoil|holo|foil)|reverse holo(?:foil)?|holofoil|holo|foil|[a-z ]+ ball pattern|energy symbol pattern|team rocket pattern|terastal pattern)$/i;
export const isPrintingLabel = (label: string) => PRINTING_LABEL.test(label.trim());

/** Every Japanese group, read once per run. */
export function japanGroups(): Promise<Group[]> {
  return read<{ results: Group[] }>(`${BASE}/groups`).then((b) => b.results);
}

/**
 * The sets neither code nor title finds, looked up in tcgcsv on 2026-09-14. TCGdex's code is not
 * TCGplayer's (XY11a is "XY11-Bb", SM1p is "sm1+", SVLS is "svL"), its English title is its own
 * translation ("Reviving Legends" against "L2: Revival Legends", "Holon Phantoms" against "Holon
 * Phantom"), or the title finds the wrong group: ADV1's "Expansion Pack" is the 1996 PMCG group's
 * title, so ADV1 read Base Set's cards. SM1p is the "sm1+" group with 68 numbered cards, not the
 * "SM1+" group, which holds three products and one card.
 */
export const GROUP_BY_HAND: Readonly<Record<string, number>> = {
  XY11a: 23916, // XY11-Bb: Fever-Burst Fighter
  L2: 24021, // L2: Revival Legends
  ADV4: 24124, // Magma VS Aqua: Two Ambitions
  ADV1: 24129, // ADV Expansion Pack
  SM1p: 23880, // sm1+: Enhanced Expansion Pack Sun & Moon
  SM2p: 23693, // SM2+: Facing a New Trial
  PCG7: 24084, // Holon Phantom
  web1: 24141, // Pokemon Web
  SVLS: 23793, // SV: Ceruledge ex Stellar Tera Type Starter Set
};

/** A group's code: its abbreviation, or the part of its name before ": ". */
const codeOf = (g: Group, code: string) =>
  (g.abbreviation ?? "").toLowerCase() === code || g.name.toLowerCase().startsWith(`${code}:`);

/**
 * The TCGplayer group a TCGdex set is: the one the table above names, else the one whose code is
 * the set's id, else the one whose title is the set's English title, whole or after its code.
 * Where several groups share the code, the one titled with it, then the one with the most numbered
 * cards (`numbered`, counted by the caller for exactly those groups: sharedCodeGroups), then the
 * one whose title is the set's. Null where nothing names exactly one group.
 */
export function groupForSet(
  groups: Group[],
  set: { id: string; name: string },
  numbered: ReadonlyMap<number, number> = new Map(),
): Group | null {
  const hand = GROUP_BY_HAND[set.id];
  const byHand = hand == null ? undefined : groups.find((g) => g.groupId === hand);
  if (byHand) return byHand;
  const code = set.id.toLowerCase();
  const title = fold(set.name);
  const titled = (g: Group) =>
    !!title && (fold(g.name) === title || fold(g.name.split(": ").slice(-1)[0]!) === title);
  const byCode = groups.filter((g) => codeOf(g, code));
  if (byCode.length === 1) return byCode[0]!;
  if (byCode.length > 1) {
    const coded = byCode.filter((g) => g.name.toLowerCase().startsWith(`${code}:`));
    if (coded.length === 1) return coded[0]!;
    const pool = coded.length ? coded : byCode;
    const most = Math.max(...pool.map((g) => numbered.get(g.groupId) ?? -1));
    const top = pool.filter((g) => (numbered.get(g.groupId) ?? -1) === most);
    if (most >= 0 && top.length === 1) return top[0]!;
    const named = top.filter(titled);
    return named.length === 1 ? named[0]! : null;
  }
  const byTitle = groups.filter(titled);
  return byTitle.length === 1 ? byTitle[0]! : null;
}

/**
 * The groups whose numbered cards groupForSet needs counted for these sets: those sharing a code
 * with another group, where a set's id is that code. "SM1+" and "sm1+" share one, as do the three
 * L2 groups (2026-09-14); the count is one products read each, only for them.
 */
export function sharedCodeGroups(groups: Group[], sets: { id: string }[]): number[] {
  const ids = new Set<number>();
  for (const s of sets) {
    if (GROUP_BY_HAND[s.id] != null) continue;
    const byCode = groups.filter((g) => codeOf(g, s.id.toLowerCase()));
    if (byCode.length > 1) for (const g of byCode) ids.add(g.groupId);
  }
  return [...ids];
}

/**
 * A group's cards, one per card: the products with a number or a Pokémon's HP, the plain product
 * where TCGplayer also sells a printing of the same card (a foil, a ball pattern) as a product of
 * its own. A product under any other label is a card of its own. Sealed products (booster boxes,
 * decks) carry none of number, rarity or type and are left out.
 */
export async function groupCards(groupId: number): Promise<TcgplayerJapanCard[]> {
  const { results } = await read<{ results: Product[] }>(`${BASE}/${groupId}/products`);
  const cards = new Map<string, TcgplayerJapanCard & { printed: boolean }>();
  for (const p of results) {
    const numbered = extended(p, "Number");
    const rarity = extended(p, "Rarity");
    const cardType = extended(p, "CardType");
    if (!numbered && !rarity && !cardType) continue;
    const [before, after] = (numbered ?? "").split("/");
    const number = before?.trim() || null;
    const total = after?.trim() || null;
    const name = cardName(p.name);
    const labels = labelsOf(p.name);
    const printed = labels.some(isPrintingLabel);
    const label = labels.filter((l) => !isPrintingLabel(l)).join(" / ") || null;
    /* The whole printed number, total and all (the MC start deck prints 009/742 and 009/023), and
       the name: SM10 lists Martial Arts Dojo and Dust Island both as 089/095. */
    const key = `${numbered ? `${number}/${total ?? ""}` : ""}|${name.toLowerCase()}|${label ?? ""}`;
    const held = cards.get(key);
    // The plain product stands for the card; a printing only where there is no plain one.
    if (held && (!held.printed || printed)) continue;
    const hp = Number(extended(p, "HP"));
    cards.set(key, {
      productId: p.productId,
      number,
      total,
      name,
      label,
      rarity,
      cardType,
      hp: Number.isFinite(hp) && hp > 0 ? hp : null,
      stage: extended(p, "Stage"),
      image: `https://tcgplayer-cdn.tcgplayer.com/product/${p.productId}_in_1000x1000.jpg`,
      printed,
    });
  }
  return [...cards.values()].map(({ printed: _printed, ...card }) => card);
}

/** The energy types a TCGplayer card type can be; anything else (Trainer, Special) is no type. */
const ENERGY = new Set([
  "Grass",
  "Fire",
  "Water",
  "Lightning",
  "Psychic",
  "Fighting",
  "Darkness",
  "Metal",
  "Fairy",
  "Dragon",
  "Colorless",
]);

/**
 * A TCGplayer card type as the copy files it: TCGdex's category, trainer kind and types. A bare
 * "Trainer" is a trainer of no kind TCGplayer names (532 products, 2026-09-14). A card with HP
 * and no type TCGplayer names is a Pokémon: ADV5-060 Dodrio, 80 HP, stood with no category.
 * The Antique fossils are items with HP, and stay items.
 */
export function factsOfCardType(
  cardType: string | null,
  hp: number | null = null,
): {
  category: string | null;
  trainerType: string | null;
  types: string[];
} {
  const types = (cardType ?? "")
    .split(";")
    .map((t) => t.trim())
    .filter((t) => ENERGY.has(t));
  if (types.length) return { category: "Pokemon", trainerType: null, types: [...new Set(types)] };
  const trainer = /^Trainer(?:\s*-\s*(.+))?$/.exec(cardType ?? "");
  if (trainer) return { category: "Trainer", trainerType: trainer[1] ?? null, types: [] };
  if (/energy|special/i.test(cardType ?? ""))
    return { category: "Energy", trainerType: null, types: [] };
  if (hp != null && hp > 0) return { category: "Pokemon", trainerType: null, types: [] };
  return { category: null, trainerType: null, types: [] };
}

/** Every species' English name folded, longest first, so Mewtwo is found before Mew. */
const FOLDED_SPECIES = (SPECIES as string[])
  .map((name) => fold(name))
  .filter((name) => name.length >= 3)
  .sort((a, b) => b.length - a.length);

/** The species named in an English card name, each once, longest first where two overlap. */
function speciesIn(name: string): Set<string> {
  let rest = fold(name);
  const found = new Set<string>();
  for (const s of FOLDED_SPECIES) {
    if (!rest.includes(s)) continue;
    found.add(s);
    rest = rest.split(s).join("|");
  }
  return found;
}

/** Words that say nothing about which card it is. */
const FILLER = new Set([
  "the",
  "of",
  "and",
  "ex",
  "gx",
  "v",
  "vmax",
  "vstar",
  "card",
  "pokemon",
  "basic",
  "energy",
]);
const wordsOf = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !FILLER.has(w));

/**
 * Whether a TCGdex card's English name and a TCGplayer product's name are one card. Where the card
 * has no English name (its name is still Japanese) nothing can disagree. Where both name species,
 * they must share one: TCGdex's official "Erika's Oddish" and TCGplayer's literal "Oddish" agree,
 * SM10-026 Krabby and TCGplayer's Kingler do not. Otherwise one name holds the other, or they share
 * a word or an owner ("Boss's Orders" and "Boss's Orders (Giovanni)", "N's Plan" and "N's Plot").
 */
export function namesAgree(cardName: string, productName: string): boolean {
  if (!/[A-Za-z]/.test(cardName)) return true;
  const a = fold(cardName);
  const b = fold(productName);
  if (!a || !b || a === b || a.includes(b) || b.includes(a)) return true;
  const sa = speciesIn(cardName);
  const sb = speciesIn(productName);
  if (sa.size && sb.size) return [...sa].some((s) => sb.has(s));
  if (sa.size || sb.size) return false;
  const wb = new Set([...wordsOf(productName), ...ownersOf(productName)]);
  return [...wordsOf(cardName), ...ownersOf(cardName)].some((w) => wb.has(w));
}

/** The owners a name is of, "n's" of "N's Plan", however short. */
const ownersOf = (name: string) =>
  [...name.toLowerCase().matchAll(/([a-z.]+)['’]s\b/g)].map((m) => `${m[1]}'s`);

/**
 * Whether a product at a card's number is another card: its species differ from the card's, or,
 * for a name without a species on both sides, another product of the group carries the card's
 * name (S8's Training Court sat at 126 in TCGdex and at 127 in TCGplayer). A trainer whose names
 * are two translations with no word in common and nothing else to point at is the same card:
 * TCGdex's Blowtorch is TCGplayer's Heat Burner (M2-074), its Strange Timepiece the Suspicious
 * Watch (M1S-057). Measured 2026-09-14, the strict check alone dropped seven such right links.
 */
export function productIsAnother(
  products: TcgplayerJapanCard[],
  cardName: string,
  product: TcgplayerJapanCard,
): boolean {
  if (namesAgree(cardName, product.name)) return false;
  if (speciesIn(cardName).size && speciesIn(product.name).size) return true;
  return products.some((p) => p !== product && fold(p.name) === fold(cardName));
}

type CardToMatch = {
  number: string;
  name: string;
  /** The name as printed, for a label TCGdex keeps in it: ハウンドア（HR）. */
  localName?: string | null;
  /** The set's printed total, to tell 009/742 from 009/023 in one group. */
  printedTotal?: number | null;
};

const unpadded = (n: string) => n.replace(/^0+(?=\d)/, "");
const labelled = (card: CardToMatch, label: string) =>
  `${card.localName ?? ""} ${card.name}`
    .normalize("NFKC")
    .toLowerCase()
    .includes(`(${label.toLowerCase()})`);

/**
 * The TCGplayer card for a TCGdex card of the same set: by number (TCGdex pads to three digits,
 * TCGplayer prints what the card prints), the name agreeing (namesAgree), the set's printed total
 * deciding between two numberings in one group; and by English name where TCGplayer has no
 * numbers, only where that name is one card in the group, or one card under the label the card
 * prints. Null where no single product is left.
 */
export function matchCard(
  cards: TcgplayerJapanCard[],
  card: CardToMatch,
): TcgplayerJapanCard | null {
  const n = unpadded(card.number);
  let byNumber = cards.filter((c) => c.number && unpadded(c.number) === n);
  if (byNumber.length) {
    const agreeing = byNumber.filter((c) => namesAgree(card.name, c.name));
    byNumber =
      agreeing.length || byNumber.length > 1
        ? agreeing
        : byNumber.filter((c) => !productIsAnother(cards, card.name, c));
    if (byNumber.length > 1 && card.printedTotal != null) {
      const sameTotal = byNumber.filter(
        (c) => c.total && unpadded(c.total) === String(card.printedTotal),
      );
      if (sameTotal.length) byNumber = sameTotal;
    }
    if (byNumber.length > 1) {
      const plain = byNumber.filter((c) => !c.label);
      if (plain.length === 1) byNumber = plain;
    }
    if (byNumber.length > 1) {
      // M6 sells Legendary Summit 073/076 beside "Legendary Summit [Set of 2]" 073/076.
      const exact = byNumber.filter((c) => fold(c.name) === fold(card.name));
      if (exact.length === 1) byNumber = exact;
    }
    return byNumber.length === 1 ? byNumber[0]! : null;
  }
  const name = card.name.toLowerCase();
  const byName = cards.filter((c) => !c.number && c.name.toLowerCase() === name);
  if (byName.length <= 1) return byName[0] ?? null;
  const byLabel = byName.filter((c) => c.label && labelled(card, c.label));
  if (byLabel.length === 1) return byLabel[0]!;
  const plain = byName.filter((c) => !c.label);
  return plain.length === 1 && !byLabel.length ? plain[0]! : null;
}

/**
 * The TCGplayer card for every card of a set, each product given to one card only. Where two cards
 * found the same product, the one whose English name is the product's keeps it, and neither does
 * where both or neither are: S11-047 and S11-048 both named Swirlix or Slurpuff in turn before
 * 2026-09-14.
 */
export function matchCards<C extends CardToMatch & { id: string }>(
  products: TcgplayerJapanCard[],
  cards: C[],
): Map<string, TcgplayerJapanCard | null> {
  const found = new Map(cards.map((c) => [c.id, matchCard(products, c)]));
  const byProduct = new Map<number, C[]>();
  for (const c of cards) {
    const p = found.get(c.id);
    if (p) byProduct.set(p.productId, [...(byProduct.get(p.productId) ?? []), c]);
  }
  for (const [, claimants] of byProduct) {
    if (claimants.length < 2) continue;
    const exact = claimants.filter((c) => fold(c.name) === fold(found.get(c.id)!.name));
    for (const c of claimants) if (exact.length !== 1 || exact[0] !== c) found.set(c.id, null);
  }
  return found;
}
