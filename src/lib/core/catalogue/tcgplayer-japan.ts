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
 * A set is found by code first ("S4a: Shiny Star V" is TCGdex's S4a) and by its English title
 * otherwise (the vintage groups carry no code: "Base Expansion Pack" is E1). A card is found by its
 * number, and by its English name where TCGplayer prints none (PMCG and neo are unnumbered there).
 */
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
  /** The English name, without the number and the printing TCGplayer adds to a product's name. */
  name: string;
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
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const extended = (p: Product, name: string) =>
  p.extendedData?.find((e) => e.name === name)?.value ?? null;

/** "Charizard V - 003/190 (Mirror Holofoil)" is Charizard V; the printing in brackets is the product's. */
export const cardName = (productName: string) =>
  productName
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/\s+-\s+[A-Za-z0-9-]*\d+\/[A-Za-z0-9-]+\s*$/, "")
    .trim();

/** A product's printing in brackets, which marks a second product of the same card. */
const printingOf = (productName: string) => /\(([^)]*)\)\s*$/.exec(productName)?.[1] ?? null;

/** Every Japanese group, read once per run. */
export function japanGroups(): Promise<Group[]> {
  return read<{ results: Group[] }>(`${BASE}/groups`).then((b) => b.results);
}

/**
 * The TCGplayer group a TCGdex set is: the one whose code is the set's id, or else the one whose
 * title is the set's English title. Null where neither names exactly one group.
 */
export function groupForSet(groups: Group[], set: { id: string; name: string }): Group | null {
  const code = set.id.toLowerCase();
  const byCode = groups.filter(
    (g) =>
      (g.abbreviation ?? "").toLowerCase() === code || g.name.toLowerCase().startsWith(`${code}:`),
  );
  const coded = byCode.filter((g) => g.name.toLowerCase().startsWith(`${code}:`));
  if (coded.length === 1) return coded[0]!;
  if (byCode.length === 1) return byCode[0]!;
  const title = fold(set.name);
  if (!title) return null;
  const byTitle = groups.filter((g) => fold(g.name.split(": ").slice(-1)[0]!) === title);
  return byTitle.length === 1 ? byTitle[0]! : null;
}

/**
 * A group's cards, one per card: the products with a number or a Pokémon's HP, the plain product
 * where TCGplayer also sells a printing of the same card as a product of its own. Sealed products
 * (booster boxes, decks) carry neither and are left out.
 */
export async function groupCards(groupId: number): Promise<TcgplayerJapanCard[]> {
  const { results } = await read<{ results: Product[] }>(`${BASE}/${groupId}/products`);
  const cards = new Map<string, TcgplayerJapanCard & { printed: boolean }>();
  for (const p of results) {
    const numbered = extended(p, "Number");
    const rarity = extended(p, "Rarity");
    const cardType = extended(p, "CardType");
    if (!numbered && !rarity && !cardType) continue;
    const number = numbered?.split("/")[0]?.trim() || null;
    const name = cardName(p.name);
    const key = number ?? `name:${name.toLowerCase()}`;
    const printed = printingOf(p.name) !== null;
    const held = cards.get(key);
    // The plain product stands for the card; a bracketed printing only where there is no plain one.
    if (held && (!held.printed || printed)) continue;
    const hp = Number(extended(p, "HP"));
    cards.set(key, {
      productId: p.productId,
      number,
      name,
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

/** A TCGplayer card type as the copy files it: TCGdex's category, trainer kind and types. */
export function factsOfCardType(cardType: string | null): {
  category: string | null;
  trainerType: string | null;
  types: string[];
} {
  if (!cardType) return { category: null, trainerType: null, types: [] };
  if (ENERGY.has(cardType)) return { category: "Pokemon", trainerType: null, types: [cardType] };
  const trainer = /^Trainer\s*-\s*(.+)$/.exec(cardType);
  if (trainer) return { category: "Trainer", trainerType: trainer[1]!, types: [] };
  if (/energy|special/i.test(cardType)) return { category: "Energy", trainerType: null, types: [] };
  return { category: null, trainerType: null, types: [] };
}

/**
 * The TCGplayer card for a TCGdex card of the same set: by number (TCGdex pads to three digits,
 * TCGplayer prints what the card prints), and by English name where TCGplayer has no numbers, only
 * where that name is one card in the group.
 */
export function matchCard(
  cards: TcgplayerJapanCard[],
  card: { number: string; name: string },
): TcgplayerJapanCard | null {
  const n = card.number.replace(/^0+(?=\d)/, "");
  const byNumber = cards.filter((c) => c.number && c.number.replace(/^0+(?=\d)/, "") === n);
  if (byNumber.length === 1) return byNumber[0]!;
  if (byNumber.length > 1) return null;
  const name = card.name.toLowerCase();
  const byName = cards.filter((c) => !c.number && c.name.toLowerCase() === name);
  return byName.length === 1 ? byName[0]! : null;
}
