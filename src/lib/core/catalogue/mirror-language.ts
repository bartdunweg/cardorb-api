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
  listCatalogueSync,
  writeCatalogueSet,
  writeCatalogueSetRecord,
} from "@/lib/storage/postgres";
import { DAY, catalogueTimeout, mapLimit } from "../util";
import { limitlessJapaneseScan, tcgdexScan, tcgdexScanIsReverse } from "./artwork";
import { CATALOGUE_FORMAT, ownArt, type SyncReport } from "./mirror";
import TCGPLAYER_JA from "../tcgplayer-ids.ja.generated.json";
import { fullArtOf } from "./full-art";
import { canStoreImages, keepImage } from "./image-store";
import type { CardSheetFacts, CatalogueMatch } from "./ptcg-search";
import { canonicalRarity } from "./rarity-names";
import { CatalogueNotFound, json } from "./tcgdex-client";
import { type BrowseLanguage, listSetsIn, setIn } from "./tcgdex-browse";
import { scrydexJapanExpansions, scrydexLogoFor } from "./scrydex-japan-logos";
import {
  type TcgplayerJapanCard,
  factsOfCardType,
  groupCards,
  groupForSet,
  japanGroups,
  matchCard,
} from "./tcgplayer-japan";

const HOST = "https://api.tcgdex.net/v2";

/**
 * The shape of Japanese copy a set is written in, on top of the shared one. 2: TCGplayer's product
 * picture where neither TCGdex nor Limitless has the card, which is every promo (SV-P, M-P): their
 * numbers are no file name at Limitless, and the first pass left 10 of 150 sampled cards blank.
 * 3: TCGplayer's Japanese shelf as a catalogue (tcgplayer-japan.ts): the cards of a set TCGdex lists
 * without any, a picture matched by number or English name, and each card's TCGplayer product.
 * 4: each set's wordmark from Scrydex (scrydex-japan-logos.ts).
 */
const LANGUAGE_FORMAT = CATALOGUE_FORMAT + 3;

/** TCGplayer's 1000 px product picture for a Japanese card, where its Japanese shelf sells one. */
async function tcgplayerJapaneseScan(id: string): Promise<string | null> {
  const product = (TCGPLAYER_JA as Record<string, number | null | undefined>)[id];
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
): Promise<string | null> {
  if (held && held.startsWith("https://images.cardorb.com/")) return held;
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
  }: { budgetMs?: number; parallel?: number; cardParallel?: number; now?: () => number } = {},
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
    .map((s, i) => ({ id: s.id, key: rank(s.id, s.total), i }))
    .sort((a, b) => a.key[0] - b.key[0] || a.key[1].localeCompare(b.key[1]) || a.i - b.i)
    .map((s) => s.id);

  const storing = await canStoreImages();
  // TCGplayer's Japanese groups, once for the run; a shelf that does not answer costs the run its
  // second source, not its copy.
  const groups = lang === "ja" ? await japanGroups().catch(() => []) : [];
  // Scrydex's Japanese expansions, for each set's wordmark; a page that does not answer costs the run
  // its logos, which are kept as they were.
  const expansions = lang === "ja" ? await scrydexJapanExpansions().catch(() => null) : null;
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
        const group = groupForSet(groups, { id, name: set.name });
        const products = group ? await groupCards(group.groupId).catch(() => []) : [];
        /* A set TCGdex lists without its cards is TCGplayer's list where TCGplayer has the set:
           one card per printed number, filed under TCGdex's id rule (set id, number). */
        const fromTcgplayer = !read.cards.length && products.some((p) => p.number);
        const cards: CatalogueMatch[] = fromTcgplayer
          ? products
              .filter((p): p is TcgplayerJapanCard & { number: string } => !!p.number)
              .map((p) => ({
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
          : read.cards;
        const productOf = new Map(
          cards.map((c) => [
            c.id,
            fromTcgplayer
              ? (products.find((p) => p.number === c.number) ?? null)
              : matchCard(products, c),
          ]),
        );
        const held = await catalogueCardsById(
          db,
          cards.map((c) => c.id),
          lang,
        )
          .then((rows) => new Map(rows.map((r) => [r.id, r.image])))
          .catch(() => new Map<string, string | null>());
        const resolved = await mapLimit(cards, cardParallel, async (card) => {
          const product = productOf.get(card.id) ?? null;
          const image = await pictureOf(card, held.get(card.id), storing, product);
          if (held.get(card.id) !== image) report.pictures++;
          if (fromTcgplayer && product) {
            const kind = factsOfCardType(product.cardType);
            return {
              ...card,
              image,
              imageHigh: null,
              rarity: canonicalRarity(product.rarity),
              types: kind.types,
              category: kind.category,
              trainerType: kind.trainerType,
              productId: product.productId,
              sheet: {
                ...sheetOf(null),
                hp: product.hp,
                stage: product.stage,
              },
            };
          }
          const facts = await cardRecord(lang, card.id);
          return {
            ...card,
            image,
            imageHigh: null,
            rarity: canonicalRarity(facts?.rarity ?? null),
            types: facts?.types ?? [],
            category: facts?.category ?? null,
            trainerType: facts?.trainerType ?? null,
            productId:
              product?.productId ??
              (TCGPLAYER_JA as Record<string, number | null | undefined>)[card.id] ??
              null,
            sheet: sheetOf(facts),
          };
        });
        const arts = fullArtOf(resolved);
        await writeCatalogueSetRecord(db, {
          language: lang,
          id,
          name: set.name,
          local_name: set.localName,
          series: set.series,
          release_date: set.releaseDate,
          logo: await ownArt(
            set.logo ?? (expansions ? scrydexLogoFor(expansions, { id, name: set.name }) : null),
            storing,
          ),
          symbol: await ownArt(set.symbol, storing),
          abbreviation: set.abbreviation ?? null,
          total: set.total,
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
            local_id: c.number,
            name: c.name,
            local_name: c.localName,
            set_name: set.name,
            series: set.series,
            release_date: set.releaseDate,
            rarity: c.rarity,
            types: c.types,
            image: c.image,
            category: c.category,
            trainer_type: c.trainerType,
            full_art: arts.has(c),
            illustrator: c.sheet.illustrator,
            hp: c.sheet.hp,
            stage: c.sheet.stage,
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
