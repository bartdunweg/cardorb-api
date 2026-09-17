/**
 * The Japanese catalogue's copy in Postgres, beside the English one and in the same tables.
 *
 * Bart, 2026-09-14: every set, card and price the same way, out of our own store, and the sources
 * asked at night for what is new. The English copy (mirror.ts) has kept the English shelf since
 * 2026-09-11; every Japanese page, search, collection row and sheet still read TCGdex live. This
 * fills catalogue_sets and catalogue_cards with `language` 'ja' (migration 20260914235000), so the
 * readers can move onto it the way the English ones did.
 *
 * Not the English run with a flag. TCGdex answers no GraphQL for Japanese (an empty list for
 * `SV1a-`, a 404 at /v2/ja/graphql), so a card's facts are its own record, one request each, about
 * 12,800 in all. The first pass takes a few runs; after it a set is read again only when it is new,
 * its count moved, or the copy's shape did, and the oldest otherwise, as in English.
 *
 * Pictures: TCGdex's scan where its file is there and is the plain print; Limitless's plain print
 * where TCGdex has none or photographed the reverse (artwork.ts, SCANNED_AS_REVERSE), checked per
 * card rather than guessed per set, because TCGdex's Japanese folders are complete for some sets and
 * empty for others (SV1a 103 of 103, SM12a 0, 2026-09-14). Both copied into our bucket.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type CatalogueCardRecord,
  catalogueCardsById,
  listCatalogueSets,
  listCatalogueSync,
  writeCatalogueSet,
  writeCatalogueSetRecord,
} from "@/lib/storage/postgres";
import { DAY, catalogueTimeout, mapLimit } from "../util";
import { limitlessJapaneseScan, tcgdexScan, tcgdexScanIsReverse } from "./artwork";
import { CATALOGUE_FORMAT, ownArt, type SyncReport } from "./mirror";
import TCGPLAYER_JA from "../tcgplayer-ids.ja.generated.json";
import { fullArtOf } from "./full-art";
import { canStoreImages, heldUnlessOurs, isOurs, keepImage } from "./image-store";
import { handCardPicture, handSetLogo } from "./pictures-by-hand";
import type { CardSheetFacts, CatalogueMatch } from "./ptcg-search";
import { printedLocalName } from "./card-names";
import { correctedSet } from "./set-corrections";
import { extraCardsOf } from "./extra-cards";
import {
  englishEvolveFrom,
  japaneseCardName,
  japaneseLocalName,
  japaneseRarity,
  japaneseStage,
  scrydexCard,
  scrydexCodeOf,
  scrydexOnlyCards,
} from "./japanese-card-facts";
import { CatalogueNotFound, json } from "./tcgdex-client";
import { type BrowseLanguage, listSetsIn, setIn } from "./tcgdex-browse";
import {
  scrydexExpansionCards,
  scrydexExpansionFor,
  scrydexJapanExpansions,
  scrydexJapanScan,
  scrydexNumbers,
  scrydexRealLogo,
  type ScrydexExpansion,
} from "./scrydex-japan-logos";
import {
  type TcgplayerJapanCard,
  factsOfCardType,
  groupCards,
  groupForSet,
  japanGroups,
  matchCards,
  productIsAnother,
  sharedCodeGroups,
} from "./tcgplayer-japan";

const HOST = "https://api.tcgdex.net/v2";

/**
 * The shape of Japanese copy a set is written in, on top of the shared one. 2: TCGplayer's product
 * picture where neither TCGdex nor Limitless has the card, which is every promo (SV-P, M-P): their
 * numbers are no file name at Limitless, and the first pass left 10 of 150 sampled cards blank.
 * 3: TCGplayer's Japanese shelf as a catalogue (tcgplayer-japan.ts): the cards of a set TCGdex lists
 * without any, a picture matched by number or English name, and each card's TCGplayer product.
 * 4: each set's wordmark from Scrydex (scrydex-japan-logos.ts).
 * 5: Scrydex's scan for a card no other source pictures (scrydexNumbers).
 * 6: no Scrydex logo where Scrydex answers its generic stand-in (scrydexRealLogo).
 * 7: the names and links put right on 2026-09-14: English names by the new rules
 * (english-card-name.mjs), no machine-translated printed name, a product only where its name
 * agrees and for one card, the groups found by hand, and a picture that follows its product.
 * 8: the facts put right on 2026-09-14, round two (japanese-card-facts.ts): the printed rarity mark
 * and no rarity where none is printed, Scrydex's artist, printed name and English evolution where
 * TCGdex has none, names in the English game's printed style, the cards TCGdex lacks (Shiny Treasure
 * ex 127 to 166), and a set's total at least the cards it holds.
 */
const LANGUAGE_FORMAT = CATALOGUE_FORMAT + 7;

/**
 * The code a pack's basic Energy prints where a card number would be ("s8b GRA"): VMAX Climax's,
 * Pokémon GO's and Sun & Moon's (SM1+) print no number, and the numbers the copy held for them
 * (S8b 286 to 293, S10b 094 to 101, SM1p 070 and 071) were Scrydex's placing, read off the printed
 * cards on 2026-09-15. Bulbapedia lists them by the code. Only the number a person reads moves; the id
 * stays.
 */
const ENERGY_CODE: Readonly<Record<string, string>> = {
  Grass: "GRA",
  Fire: "FIR",
  Water: "WAT",
  Lightning: "LIG",
  Psychic: "PSY",
  Fighting: "FIG",
  Darkness: "DAR",
  Metal: "MET",
  Fairy: "FAI",
};
const CODED_ENERGY_SETS = new Set(["S8b", "S10b", "SM1p"]);
export function printedCode(
  id: string,
  number: string,
  name: string,
  scrydexOnly: boolean,
): string {
  const set = id.slice(0, id.lastIndexOf("-"));
  const type = /^(\w+) Energy$/.exec(name)?.[1];
  return scrydexOnly && CODED_ENERGY_SETS.has(set) && type && ENERGY_CODE[type]
    ? ENERGY_CODE[type]
    : number;
}

/**
 * Cards whose TCGdex record is another number's, read from that number instead. Checked on
 * 2026-09-14 against TCGplayer, Limitless and Bulbapedia's set lists: Fusion Arts prints Power
 * Tablet at 126, Training Court at 127 and the Grass and Fire Energy at 128 and 129, where TCGdex
 * has Training Court, the two energies and Power Tablet; Storm Emeralda prints Pokémon Catcher at
 * 98 and Custom Vest at 99, which TCGdex swaps. The picture stays the number's own.
 */
export const RECORD_BY_HAND: Readonly<Record<string, string>> = {
  "S8-126": "S8-129",
  "S8-127": "S8-126",
  "S8-128": "S8-127",
  "S8-129": "S8-128",
  "M6-098": "M6-099",
  "M6-099": "M6-098",
};

/**
 * Cards whose TCGplayer product the match and the price map give to the wrong card, read off the
 * pictures on 2026-09-15: TCGplayer lists M-P's Spritzee at 090, where the card printed 090 is
 * Basic Lightning Energy and Spritzee is 098 (the product's attacks are 098's). Null is no product.
 */
export const PRODUCT_BY_HAND: Readonly<Record<string, number | null>> = {
  "M-P-090": null,
  "M-P-098": 714049,
};

/**
 * Cards whose Scrydex number the nightly name match cannot find, read off the scans on 2026-09-15.
 * The match reads a set's page on scrydex.com, which now answers slower than the copy waits (40 s
 * and more), and two of these are named so no match could find them anyway: VS1's Bugsy's
 * Technical Machines carry half a machine translation, and PCG10 084 is "Energy Removal 2" where
 * Scrydex says Energy Removal. Each scan was opened: New Pokédex HANDY808, Flareon, Vaporeon and
 * Jolteon ☆, Energy Removal, and ツクシのワザマシン 01 and 02.
 */
export const SCRYDEX_NUMBER_BY_HAND: Readonly<Record<string, string>> = {
  "neo1-082": "82",
  "PCG10-011": "11",
  "PCG10-015": "15",
  "PCG10-027": "27",
  "PCG10-084": "84",
  "VS1-105": "105",
  "VS1-106": "106",
};

/** The product id in a copy of TCGplayer's picture: images.cardorb.com/tcgplayer/602654.jpg. */
const heldProduct = (image: string | null | undefined) =>
  /\/tcgplayer\/(\d+)\.jpg$/.exec(image ?? "")?.[1] ?? null;

/** A held TCGplayer photo whose product is not the card's any more. */
const heldOfAnotherProduct = (image: string | null | undefined, productId: number | null) => {
  const id = heldProduct(image);
  return id !== null && id !== String(productId);
};

/** The product the price map links a card to, outside the copy's own match. */
const linkedProduct = (id: string): number | null =>
  (TCGPLAYER_JA as Record<string, number | null | undefined>)[id] ?? null;

/** TCGplayer's 1000 px product picture for a Japanese card, where its Japanese shelf sells one. */
async function tcgplayerJapaneseScan(id: string): Promise<string | null> {
  const product = linkedProduct(id);
  if (!product) return null;
  const url = `https://tcgplayer-cdn.tcgplayer.com/product/${product}_in_1000x1000.jpg`;
  try {
    const head = await fetch(url, {
      method: "HEAD",
      next: { revalidate: DAY },
      signal: catalogueTimeout(),
    });
    return head.ok ? url : null;
  } catch {
    return null;
  }
}

/** A card's own record in a catalogue of its own: everything the list and the sheet show. */
type LanguageCardRecord = {
  rarity?: string | null;
  types?: string[] | null;
  category?: string | null;
  trainerType?: string | null;
  illustrator?: string | null;
  hp?: number | null;
  stage?: string | null;
  evolveFrom?: string | null;
  regulationMark?: string | null;
  variants?: { firstEdition?: boolean | null } | null;
  variants_detailed?:
    { type?: string | null; foil?: string | null; stamp?: string[] | null }[] | null;
};

/** One card's facts, or null where the catalogue lists the card and has no record behind it. */
async function cardRecord(lang: BrowseLanguage, id: string): Promise<LanguageCardRecord | null> {
  try {
    return (await json(
      `${HOST}/${lang}/cards/${encodeURIComponent(id)}`,
      `${lang} card ${id}`,
    )) as LanguageCardRecord | null;
  } catch (err) {
    if (err instanceof CatalogueNotFound) return null;
    throw err;
  }
}

const sheetOf = (r: LanguageCardRecord | null): CardSheetFacts => ({
  illustrator: r?.illustrator ?? null,
  hp: typeof r?.hp === "number" && Number.isFinite(r.hp) ? Math.round(r.hp) : null,
  stage: r?.stage ?? null,
  evolveFrom: r?.evolveFrom ?? null,
  regulationMark: r?.regulationMark ?? null,
  firstEdition: r?.variants?.firstEdition ?? null,
  variants: (r?.variants_detailed ?? []).map((v) => ({
    ...(v.type ? { type: v.type } : {}),
    ...(v.foil ? { foil: v.foil } : {}),
    ...(v.stamp?.length ? { stamp: v.stamp } : {}),
  })),
});

/**
 * A card's sheet with what Scrydex knows where TCGdex has nothing: the artist, and an evolution in
 * English (TCGdex writes 2,480 Japanese cards' evolution in Japanese, and none for 2,985 more).
 */
const withScrydexSheet = (
  sheet: CardSheetFacts,
  sx: ReturnType<typeof scrydexCard>,
): CardSheetFacts => ({
  ...sheet,
  // TCGdex answers an empty string for an artist it does not know (448 of 634 on 2026-09-15).
  illustrator: sheet.illustrator || sx?.a || null,
  stage: japaneseStage(sheet.stage),
  evolveFrom: sx?.e ?? englishEvolveFrom(sheet.evolveFrom),
});

/** The scan's stem off the address setIn() builds: the size and format are the reader's. */
const stemOf = (image: string | null) => image?.replace(/\/(low|high)\.webp$/, "") ?? null;

/**
 * The picture a Japanese card is copied under: our own address where the copy already holds one,
 * TCGdex's scan where its file is there and is the plain print, Limitless's plain print otherwise.
 * With the write secret, whichever it is lands in our bucket, and a file that could not be copied
 * (Limitless has none by that name) is no picture rather than an address that draws the card's back.
 */
async function pictureOf(
  card: CatalogueMatch,
  held: string | null | undefined,
  storing: boolean,
  product: TcgplayerJapanCard | null = null,
  productId: number | null = product?.productId ?? null,
): Promise<string | null> {
  /* A held copy of a TCGplayer picture is that product's: where the card's product changed or went
     (neo2-039 Houndour held Houndour (HR)'s, 2026-09-14), it is asked for again. */
  if (isOurs(held) && !heldOfAnotherProduct(held, productId)) return held;
  const setId = card.id.slice(0, card.id.lastIndexOf("-"));
  const stem = stemOf(card.image);
  const tcgdex = stem && !tcgdexScanIsReverse(setId) ? await tcgdexScan(stem) : null;
  // A card with no TCGdex record to build an address from (a set filled from TCGplayer) takes its
  // product picture first: a Limitless name guessed for a set TCGdex does not list is rarely there.
  const source =
    tcgdex ?? (!stem && product ? product.image : limitlessJapaneseScan(card.id, card.number).high);
  if (!storing) return source;
  const kept = await keepImage(source);
  if (kept && kept !== source) return kept;
  const picture = product?.image ?? (await tcgplayerJapaneseScan(card.id));
  const keptProduct = picture ? await keepImage(picture) : null;
  return keptProduct && keptProduct !== picture ? keptProduct : null;
}

/**
 * Copies as many Japanese sets as the budget allows, most needed first, each committed as it
 * finishes: a set the copy has never seen, then one whose count or the copy's shape moved, then the
 * rest oldest copy first. A set whose cards could not be read is left for the next run rather than
 * written short.
 */
export async function syncLanguageMirror(
  db: SupabaseClient,
  lang: BrowseLanguage = "ja",
  {
    budgetMs = 45_000,
    parallel = 2,
    cardParallel = 8,
    now = Date.now,
    only,
  }: {
    budgetMs?: number;
    parallel?: number;
    cardParallel?: number;
    now?: () => number;
    /** These sets alone, whatever their turn (the cron's `?sets=`, for a rule changed today). */
    only?: string[];
  } = {},
): Promise<SyncReport> {
  const start = now();
  const [shelf, done] = await Promise.all([listSetsIn(lang), listCatalogueSync(db, lang)]);
  const record = new Map(done.map((d) => [d.setId, d]));
  const order = new Map(shelf.map((s, i) => [s.id, i]));
  const rank = (setId: string, total: number): [number, string] => {
    const seen = record.get(setId);
    if (!seen) return [0, ""];
    if (seen.format < LANGUAGE_FORMAT || (seen.cards > 0 && seen.cards !== total))
      return [1, seen.syncedAt];
    return [2, seen.syncedAt];
  };
  const queue = shelf
    .filter((s) => !only?.length || only.includes(s.id))
    .map((s, i) => ({ id: s.id, key: rank(s.id, s.total), i }))
    .sort((a, b) => a.key[0] - b.key[0] || a.key[1].localeCompare(b.key[1]) || a.i - b.i)
    .map((s) => s.id);

  const storing = await canStoreImages();
  // TCGplayer's Japanese groups, once for the run; a shelf that does not answer costs the run its
  // second source, not its copy.
  const groups = lang === "ja" ? await japanGroups().catch(() => []) : [];
  /* A set's wordmark. One the copy already holds in our bucket is kept and Scrydex is not asked
     again, as a held card picture is: on 2026-09-15 Scrydex's expansions page answered 524 and a
     run that asked it for every set wrote all 169 Japanese sets without their logo. Only a set
     without one asks, off the expansions page read once (and only then), or where that page does
     not answer, by the Scrydex code on file (scrydexCodeOf). */
  const heldSets = new Map((await listCatalogueSets(db, lang)).map((s) => [s.id, s]));
  let expansionsRead: Promise<ScrydexExpansion[] | null> | null = null;
  const scrydexExpansions = (): Promise<ScrydexExpansion[] | null> =>
    lang === "ja"
      ? (expansionsRead ??= scrydexJapanExpansions().catch(() => null))
      : Promise.resolve(null);
  const scrydexLogo = async (id: string, name: string): Promise<string | null> => {
    if (lang !== "ja") return null;
    const held = heldSets.get(id)?.logo;
    if (isOurs(held)) return held;
    const listed = await scrydexExpansions();
    const code = listed ? scrydexExpansionFor(listed, { id, name })?.code : scrydexCodeOf(id);
    const found = code
      ? await scrydexRealLogo(`https://images.scrydex.com/pokemon/${code}-logo/logo`)
      : null;
    return found ?? held ?? null;
  };
  /* Groups sharing a code with another are told apart by how many numbered cards each holds
     ("SM1+" has one, "sm1+" 68): one products read per such group, only for those. */
  const numbered = new Map<number, number>(
    await Promise.all(
      sharedCodeGroups(groups, shelf).map(async (g): Promise<[number, number]> => [
        g,
        await groupCards(g)
          .then((cards) => cards.filter((c) => c.number).length)
          .catch(() => -1),
      ]),
    ),
  );
  /* The TCGplayer groups a set TCGdex lists cards for already reads. TCGdex lists SM3p with cards
     and SM3+ with none under one name, and both found TCGplayer's "SM3+" group: the copy held every
     card of it twice, and SM1+ was one energy from a booster box group (2026-09-14). A set is built
     from TCGplayer only out of a group no set with TCGdex cards claims. */
  const claimed = new Map<number, string>();
  for (const s of shelf) {
    if (!s.cardsRecorded) continue;
    const g = groupForSet(groups, { id: s.id, name: s.name }, numbered)?.groupId;
    if (g != null && !claimed.has(g)) claimed.set(g, s.id);
  }
  const report: SyncReport = { copied: [], failed: [], left: 0, pictures: 0, art: 0, ms: 0 };
  const next = () => (now() - start < budgetMs ? queue.shift() : undefined);
  const worker = async () => {
    for (let id = next(); id !== undefined; id = next()) {
      try {
        const read = await setIn(lang, id);
        if (!read) {
          report.failed.push(id);
          continue;
        }
        const { set } = read;
        const group = groupForSet(groups, { id, name: set.name }, numbered);
        const products = group ? await groupCards(group.groupId).catch(() => []) : [];
        /* A set TCGdex lists without its cards is TCGplayer's list where TCGplayer has the set:
           one card per printed number, filed under TCGdex's id rule (set id, number). */
        const fromTcgplayer =
          !read.cards.length &&
          !!group &&
          (claimed.get(group.groupId) ?? id) === id &&
          products.some((p) => p.number);
        // One card per printed number: the plain product where a labelled one shares it.
        const perNumber: (TcgplayerJapanCard & { number: string })[] = [];
        for (const p of products) {
          if (!p.number) continue;
          const at = perNumber.findIndex((q) => q.number === p.number);
          if (at < 0) perNumber.push({ ...p, number: p.number });
          else if (perNumber[at]!.label && !p.label) perNumber[at] = { ...p, number: p.number };
        }
        const own = new Map(read.cards.map((c) => [c.id, c]));
        const listed: CatalogueMatch[] = fromTcgplayer
          ? perNumber.map((p) => ({
              id: `${id}-${p.number}`,
              number: p.number,
              name: p.name,
              localName: null,
              setName: set.name,
              image: null,
              imageHigh: null,
              rarity: null,
              types: [],
              series: set.series || null,
              tcgId: `${id}-${p.number}`,
            }))
          : read.cards.map((c) => {
              const from = own.get(RECORD_BY_HAND[c.id] ?? "");
              return from
                ? {
                    ...from,
                    id: c.id,
                    number: c.number,
                    tcgId: c.tcgId,
                    image: c.image,
                    imageHigh: c.imageHigh,
                  }
                : c;
            });
        /* The cards Scrydex lists with a printed number of this set and neither TCGdex nor TCGplayer's
           list has: Shiny Treasure ex's 127 to 166 (2026-09-14). */
        const numbers = new Set(listed.map((c) => c.number.replace(/^0+(?=\d)/, "")));
        // The cards the copy adds by hand (extra-cards.ts): pack Energy that print a code, promos.
        const extras = new Map(
          extraCardsOf(lang, id).filter(
            ([cardId]) => !own.has(cardId) && !listed.some((c) => c.id === cardId),
          ),
        );
        const cards: CatalogueMatch[] = [
          ...listed,
          ...[...extras].map(([cardId, x]) => ({
            id: cardId,
            number: x.number,
            name: x.name,
            localName: x.localName ?? null,
            setName: set.name,
            image: null,
            imageHigh: null,
            rarity: x.rarity ?? null,
            types: x.types,
            series: set.series || null,
            tcgId: cardId,
          })),
          ...scrydexOnlyCards(id)
            .filter(
              ([cardId]) => !numbers.has(cardId.slice(id.length + 1).replace(/^0+(?=\d)/, "")),
            )
            .map(([cardId, sx]) => ({
              id: cardId,
              number: cardId.slice(id.length + 1),
              name: sx.n ?? sx.j ?? cardId,
              localName: sx.j ?? null,
              setName: set.name,
              image: null,
              imageHigh: null,
              rarity: null,
              types: sx.t ?? [],
              series: set.series || null,
              tcgId: cardId,
            })),
        ];
        const matched = fromTcgplayer
          ? new Map(cards.map((c) => [c.id, perNumber.find((p) => p.number === c.number) ?? null]))
          : matchCards(
              products,
              cards.map((c) => ({
                id: c.id,
                number: c.number,
                name: c.name,
                localName: c.localName,
                printedTotal: correctedSet({
                  id,
                  name: set.name,
                  language: lang,
                  printed_total: set.printedTotal,
                }).printed_total,
              })),
            );
        const productOf = new Map(
          cards.map((c) => {
            const hand = PRODUCT_BY_HAND[c.id];
            if (hand === undefined) return [c.id, matched.get(c.id) ?? null];
            return [
              c.id,
              hand === null ? null : (products.find((p) => p.productId === hand) ?? null),
            ];
          }),
        );
        /* The price map's product where the copy matched none, unless the group lists that product
           under another card's name: the map was built by number and carries the same swaps. */
        const productIdOf = (c: CatalogueMatch): number | null => {
          if (PRODUCT_BY_HAND[c.id] !== undefined) return PRODUCT_BY_HAND[c.id]!;
          const extraProduct = extras.get(c.id)?.product;
          if (extraProduct) return extraProduct;
          const product = productOf.get(c.id);
          if (product) return product.productId;
          const listed = linkedProduct(c.id);
          const there = listed == null ? null : products.find((p) => p.productId === listed);
          return there && productIsAnother(products, c.name, there) ? null : listed;
        };
        const held = await catalogueCardsById(
          db,
          cards.map((c) => c.id),
          lang,
          // A store that will not answer fails the set rather than write over pictures it cannot see.
        ).then((rows) => new Map(rows.map((r) => [r.id, r.image])));
        const resolved = await mapLimit(cards, cardParallel, async (card) => {
          const product = productOf.get(card.id) ?? null;
          const productId = productIdOf(card);
          const extra = extras.get(card.id);
          if (extra) {
            /* Its own picture, into our bucket; one TCGplayer does not show yet (M-P 052, the Ultra
               Force Energy) is no picture, and the one held is kept. */
            const before = held.get(card.id) ?? null;
            const kept = extra.image && storing ? await keepImage(extra.image) : null;
            const image =
              before?.startsWith("https://images.cardorb.com/") || !extra.image
                ? before
                : kept && kept !== extra.image
                  ? kept
                  : storing
                    ? before
                    : extra.image;
            if (held.get(card.id) !== image) report.pictures++;
            return {
              ...card,
              image,
              imageHigh: null,
              rarity: extra.rarity ?? null,
              types: extra.types,
              category: extra.category,
              trainerType: extra.trainerType ?? null,
              productId,
              sheet: {
                ...sheetOf(null),
                illustrator: extra.illustrator ?? null,
                hp: extra.hp ?? null,
                stage: extra.stage ?? null,
                evolveFrom: extra.evolveFrom ?? null,
              },
            };
          }
          const image = await pictureOf(card, held.get(card.id), storing, product, productId);
          if (held.get(card.id) !== image) report.pictures++;
          const sx = scrydexCard(card.id);
          if (sx?.x && !own.has(card.id)) {
            return {
              ...card,
              image,
              imageHigh: null,
              rarity: japaneseRarity({ mark: sx.m, tcgplayer: product?.rarity }),
              types: sx.t ?? [],
              category: sx.c ?? null,
              trainerType: sx.tt ?? null,
              productId,
              sheet: {
                ...sheetOf(null),
                illustrator: sx.a ?? null,
                hp: sx.h ?? product?.hp ?? null,
                stage: sx.s ?? null,
                evolveFrom: sx.e ?? null,
              },
            };
          }
          if (fromTcgplayer && product) {
            const kind = factsOfCardType(product.cardType, product.hp);
            return {
              ...card,
              image,
              imageHigh: null,
              rarity: japaneseRarity({ mark: sx?.m, tcgplayer: product.rarity }),
              types: kind.types,
              category: kind.category,
              trainerType: kind.trainerType,
              productId: product.productId,
              sheet: {
                ...sheetOf(null),
                illustrator: sx?.a ?? null,
                hp: product.hp,
                stage: japaneseStage(product.stage),
                evolveFrom: sx?.e ?? null,
              },
            };
          }
          const facts = await cardRecord(lang, RECORD_BY_HAND[card.id] ?? card.id);
          /* A card TCGdex names only in Japanese takes its product's English name, where one
             matched: trainers and energies, which english-card-name.mjs cannot translate. */
          const named =
            !card.localName && product && !/[A-Za-z]/.test(card.name)
              ? { name: product.name, localName: card.name }
              : { name: card.name, localName: card.localName };
          return {
            ...card,
            ...named,
            image,
            imageHigh: null,
            // The printed mark (japanese-card-facts.ts): Scrydex's, TCGplayer's, TCGdex's.
            rarity: japaneseRarity({
              mark: sx?.m,
              tcgplayer: product?.rarity,
              tcgdex: facts?.rarity,
            }),
            types: facts?.types ?? [],
            category: facts?.category ?? null,
            trainerType: facts?.trainerType ?? null,
            productId,
            sheet: withScrydexSheet(sheetOf(facts), sx),
          };
        });
        /* The last source, with Scrydex's permission (2026-09-14): its scan for the cards still
           without a picture, matched to Scrydex's numbering set by set. One page read per set, and
           only for a set with such a card. */
        const blank = storing ? resolved.filter((c) => !c.image) : [];
        /* The expansions page can fail like any other (scrydex.com is slow); the code the map was
           read from still names the set's scans. */
        const expansion = blank.length
          ? ((await scrydexExpansions().then((listed) =>
              listed ? scrydexExpansionFor(listed, { id, name: set.name }) : null,
            )) ?? (scrydexCodeOf(id) ? { name: set.name, code: scrydexCodeOf(id)! } : null))
          : null;
        if (expansion) {
          const onScrydex = await scrydexExpansionCards(expansion).catch(() => []);
          const scrydexByName = scrydexNumbers(onScrydex, resolved);
          await mapLimit(blank, cardParallel, async (card) => {
            const number =
              SCRYDEX_NUMBER_BY_HAND[card.id] ??
              (scrydexCard(card.id)?.x
                ? card.number.replace(/^0+(?=\d)/, "")
                : scrydexByName.get(card.id));
            const scan = number ? await scrydexJapanScan(expansion.code, number) : null;
            const kept = scan ? await keepImage(scan) : null;
            if (kept && kept !== scan) {
              card.image = kept;
              report.pictures++;
            }
          });
        }
        /* The last resort: a picture found by hand (pictures-by-hand.ts), for a card Scrydex left
           blank too and the copy holds nothing of ours for. */
        if (storing)
          await mapLimit(
            resolved.filter((c) => !c.image && !isOurs(held.get(c.id))),
            cardParallel,
            async (card) => {
              const hand = lang === "ja" ? handCardPicture("ja", card.id) : null;
              const kept = hand ? await keepImage(hand) : null;
              if (kept && kept !== hand) {
                card.image = kept;
                report.pictures++;
              }
            },
          );
        const arts = fullArtOf(resolved);
        await writeCatalogueSetRecord(db, {
          language: lang,
          id,
          name: set.name,
          local_name: set.localName,
          series: set.series,
          release_date: set.releaseDate,
          logo: heldUnlessOurs(
            heldSets.get(id)?.logo,
            await ownArt(
              set.logo ??
                (await scrydexLogo(id, set.name)) ??
                (lang === "ja" ? handSetLogo("ja", id) : null),
              storing,
            ),
          ),
          // A symbol held in our bucket stands, and nobody is asked for it again.
          symbol: isOurs(heldSets.get(id)?.symbol)
            ? heldSets.get(id)!.symbol
            : heldUnlessOurs(heldSets.get(id)?.symbol, await ownArt(set.symbol, storing)),
          abbreviation: set.abbreviation ?? null,
          // At least the cards the copy holds: TCGdex counts Blue Shock and Red Flash as 59 cards, and
          // each prints 65 (060 to 065 are its secret rares).
          total: Math.max(set.total, resolved.length),
          printed_total: set.printedTotal,
          serie_id: set.serieId ?? null,
          cards_recorded: set.cardsRecorded || fromTcgplayer,
          sort_order: order.get(id) ?? null,
        });
        await writeCatalogueSet(
          db,
          id,
          resolved.map((c): CatalogueCardRecord => ({
            id: c.id,
            set_id: id,
            local_id: printedCode(c.id, c.number, c.name, !!scrydexCard(c.id)?.x),
            name: japaneseCardName(id, c.name, scrydexCard(c.id)?.n, c.id),
            local_name: japaneseLocalName(
              id,
              printedLocalName(id, c.localName, c.name, c.category),
              scrydexCard(c.id)?.j,
            ),
            // The set's name as its own row has it, corrections included (set-corrections.ts): a card
            // of ADV1 read "Expansion Pack" beside its set's "ADV Expansion Pack".
            set_name: correctedSet({ id, name: set.name, language: lang }).name,
            series: set.series,
            release_date: set.releaseDate,
            rarity: c.rarity,
            types: c.types,
            /* A held picture of ours stands, except a TCGplayer photo of a product the card no
               longer has: that one is wrong, and goes even where nothing replaces it (pictureOf). */
            image: heldOfAnotherProduct(held.get(c.id), c.productId)
              ? c.image
              : heldUnlessOurs(held.get(c.id), c.image),
            category: c.category,
            trainer_type: c.trainerType,
            full_art: arts.has(c),
            illustrator: c.sheet.illustrator,
            hp: c.sheet.hp,
            stage: japaneseStage(c.sheet.stage),
            evolve_from: c.sheet.evolveFrom,
            regulation_mark: c.sheet.regulationMark,
            first_edition: c.sheet.firstEdition,
            variants: c.sheet.variants,
            // The Western printings are an English card's question; a Japanese card is its own.
            languages: null,
            tcgplayer_product_id: c.productId,
          })),
          500,
          LANGUAGE_FORMAT,
          lang,
        );
        report.copied.push(id);
      } catch (err) {
        console.error(
          `[cron] copying ${lang} ${id} failed:`,
          err instanceof Error ? err.message : err,
        );
        report.failed.push(id);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, parallel) }, worker));
  report.left = queue.length;
  report.ms = Math.round(now() - start);
  return report;
}
