/**
 * A card from a catalogue that is not the English one, asked for by its own id.
 *
 * ── Why this exists at all ─────────────────────────────────────────────────
 *
 * The English path resolves a card by *number within a set found by English
 * name*: catalogue.ts turns "Obsidian Flames" into `sv03`, walks its cards, and
 * indexes them by every form of their printed number. That works because the
 * collection and TCGdex agree on what the set is called.
 *
 * They cannot agree about a Japanese set. TCGdex has no English name for
 * トリプレットビート, and the English name the shelf shows it under
 * (set-names.ja.json) is ours, not the catalogue's — the shelf's own comment
 * says so: a translation, not a catalogue fact. Worse, some of those
 * translations collide with real English sets, so resolving one by name lands
 * on the English set of the same name and dresses a Japanese card in an English
 * card's picture and price.
 *
 * So the other catalogues are not asked by set name at all. A TCGdex card id
 * names its set (`SV1a-007` is card 007 of SV1a), the row carries that id in
 * `cards.tcg_id`, and one request answers what the card is: the picture, the
 * rarity, the name and the set. There is no matching step, so there is nothing
 * to match wrongly.
 *
 * Not its price. TCGdex relays Cardmarket's figures for a Japanese card and no
 * TCGplayer ones (`pricing.tcgplayer` was null on every Japanese card sampled on
 * 2026-09-13), and every price in Card Orb is TCGplayer's. A Japanese card is
 * priced from TCGplayer's Japanese shelf on tcgcsv instead, through the id map
 * `tcgplayer-ids.ja.generated.json`, the way a Japanese set page already was
 * (shelfUsdFor in collection/collection.ts).
 *
 * ── Which catalogue ────────────────────────────────────────────────────────
 *
 * The row's `language` says: a `ja` row carries a Japanese catalogue id, and
 * every other row resolves through the English catalogue by set name.
 */

import { CatalogueNotFound, json } from "./tcgdex-client";
import { limitlessJapaneseScan, tcgdexScan, tcgdexScanIsReverse } from "./artwork";
import type { BrowseLanguage } from "./tcgdex-browse";
import type { Language } from "../collection/collection-row";

const HOST = "https://api.tcgdex.net/v2";

/**
 * The catalogues a copy of this language could have come from, in the order
 * they are asked.
 *
 * Empty for English and for every Western language: those share the English
 * catalogue's ids and its set names, so a German copy of an English card is
 * that card and resolves the way it always did. Only Japanese has a catalogue
 * of its own, and only it needs one.
 */
export function cataloguesFor(language: Language | null | undefined): readonly BrowseLanguage[] {
  return language === "ja" ? ["ja"] : [];
}

/**
 * A TCGdex card id, strictly enough that it can be a path segment.
 *
 * At least one dash, because the part before the last one is the set
 * (`setIdOf`), and a card id with no set in it would address nothing. No
 * slashes and no percent signs, so nothing can climb out of the path it is
 * interpolated into — every use below encodes it as well, belt and braces.
 */
export const TCG_ID = /^[A-Za-z0-9][A-Za-z0-9.]*(?:-[A-Za-z0-9.]+)+$/;

export const isTcgId = (v: unknown): v is string =>
  typeof v === "string" && v.length <= 60 && TCG_ID.test(v);

/**
 * The set a card id names: everything before the last dash.
 *
 * The last dash rather than the first, because a set id can hold one —
 * `S-P-051` is card 051 of the Japanese promo set `S-P`, and splitting at the
 * first dash would call the set `S`. English ids with a decimal point
 * (`sv03.5-100`) come out right for the same reason.
 */
export function setIdOf(tcgId: string): string | null {
  const cut = tcgId.lastIndexOf("-");
  return cut > 0 ? tcgId.slice(0, cut) : null;
}

/** One card as its own catalogue has it. Everything a collection row needs, in one answer. */
export type LanguageCard = {
  /** Which catalogue answered. */
  catalogue: BrowseLanguage;
  id: string;
  /** The printed number, TCGdex's `localId`. */
  number: string;
  /** In the catalogue's own script, which is what the card says. */
  name: string;
  /** TCGdex's word for it, or null where this catalogue does not grade its cards. */
  rarity: string | null;
  /** The scan's address without its size, exactly as the English catalogue hands one over. */
  image: string | null;
  /**
   * The picture pair to draw instead, where TCGdex's own is not there. Japanese only, from
   * Limitless: TCGdex had no file behind 41 of 72 sampled Japanese cards on 2026-09-11, whole
   * sets at a time, and a card you own from one of those sets showed its back on the shelf that
   * had its picture (#262). One HEAD per card, cached a day, says which; a probe that cannot be
   * made keeps TCGdex's address, as the shelf does. Null where the catalogue's own scan stands.
   */
  scan: { low: string; high: string } | null;
  setId: string | null;
  setName: string | null;
};

type TcgLanguageCard = {
  id: string;
  localId?: string;
  name?: string;
  rarity?: string | null;
  image?: string | null;
  set?: { id?: string; name?: string };
};

/**
 * One card from the first of `langs` that has it, or null where none does.
 *
 * A 404 is an answer — this catalogue does not have this card — and moves on to
 * the next. Anything else is TCGdex not answering, and it is rethrown: the
 * caller caches its result for a day, and a cached "no picture" from a minute
 * of unreachability is the failure this repository has been bitten by twice
 * (see loadSetCatalogue, which throws for the same reason).
 */
export async function languageCard(
  langs: readonly BrowseLanguage[],
  tcgId: string,
): Promise<LanguageCard | null> {
  if (!isTcgId(tcgId)) return null;
  for (const lang of langs) {
    let card: TcgLanguageCard | null;
    try {
      card = (await json(
        `${HOST}/${lang}/cards/${encodeURIComponent(tcgId)}`,
        `${lang} card ${tcgId}`,
      )) as TcgLanguageCard | null;
    } catch (err) {
      if (err instanceof CatalogueNotFound) continue;
      throw err;
    }
    if (!card) continue;
    const id = card.id ?? tcgId;
    const number = card.localId ?? "";
    // Limitless's plain print where TCGdex has no file — or has the reverse
    // variant's, which is worse than none (artwork.ts, SCANNED_AS_REVERSE).
    const scan =
      tcgdexScanIsReverse(card.set?.id ?? setIdOf(tcgId)) ||
      !(card.image && (await tcgdexScan(card.image)))
        ? limitlessJapaneseScan(id, number)
        : null;
    return {
      catalogue: lang,
      id,
      number,
      name: card.name ?? "",
      // The catalogues outside English do grade their cards, but not all of
      // them and not every card. Null is "this catalogue does not say", and the
      // row's own rarity stands where it does not.
      rarity: card.rarity ?? null,
      image: card.image ?? null,
      scan,
      setId: card.set?.id ?? setIdOf(tcgId),
      setName: card.set?.name ?? null,
    };
  }
  return null;
}

/** What one of these catalogues says about a set, for the heading over its cards. */
export type LanguageSet = {
  name: string | null;
  releaseDate: string | null;
  total: number | null;
};

/**
 * The set a card came from, for the two facts its own record does not carry.
 *
 * The card already names its set and counts it, so this is only ever asked for
 * the release date — which is what sorts a collection newest set first — and it
 * is one request per set per day for the whole world. Null rather than a throw
 * on a 404: a set the catalogue will not name still has cards that resolved,
 * and the collection reads better under the name its owner typed than not at
 * all.
 */
export async function languageSet(
  lang: BrowseLanguage,
  setId: string,
): Promise<LanguageSet | null> {
  try {
    const set = (await json(
      `${HOST}/${lang}/sets/${encodeURIComponent(setId)}`,
      `${lang} set ${setId}`,
    )) as {
      name?: string;
      releaseDate?: string | null;
      cardCount?: { official?: number; total?: number };
    } | null;
    if (!set) return null;
    return {
      name: set.name ?? null,
      releaseDate: set.releaseDate ?? null,
      total: set.cardCount?.official ?? set.cardCount?.total ?? null,
    };
  } catch (err) {
    if (err instanceof CatalogueNotFound) return null;
    throw err;
  }
}
