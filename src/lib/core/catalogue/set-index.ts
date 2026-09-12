/**
 * Which card of a set a written-down number means.
 *
 * Cut out of catalogue.ts unchanged, because there are two sources for a set now and only one
 * rule may decide this: the copy in Postgres (set-catalogue-mirror.ts) for a set the nightly run
 * has been through, TCGdex itself (catalogue.ts) for one it has not. Two matchers would be two
 * answers to "which card is 077a", and the second one would be found the day somebody's card
 * quietly wore another card's picture.
 */
import { numberForms } from "../util";

/** What a matched card contributes, which is less than either source sends. */
export type CatalogueCard = {
  id: string;
  localId: string;
  name: string;
  /**
   * The scan, as its source holds it: TCGdex's stem, or a whole file where the picture came
   * from one of the other two catalogues. Read through storedScan(), never by appending.
   */
  image: string | null;
};

/** A card as either source offers it here: the copy's row, or TCGdex's record. */
export type IndexableCard = {
  id: string;
  localId?: string | null;
  name?: string | null;
  image?: string | null;
};

/**
 * Every form of every localId, lowercased, to the card it names.
 *
 * Keyed without case, because the two vocabularies disagree on it. TCGdex writes an alternate
 * printing's number with a lowercase letter ("77a", "XY67a", "XY150a") and the collection has
 * them in capitals. Everything else about those rows lines up, so three real cards sat
 * unmatched, with no scan, no price and no page, over the shape of one letter. Shaymin EX shows
 * why it has to be the *same* card rather than a fallback to 77: "77a" is the alternate art, and
 * quietly serving 77's picture would be a confidently wrong scan.
 *
 * Only the lookup is folded, not numberForms itself: that also builds the Limitless filenames,
 * where the case is part of the path.
 *
 * `groups` is the set and then its galleries, in that order, because the order decides ties.
 * An object rather than a Map because this goes through the Data Cache and a Map does not
 * survive the trip: it arrives as `{}`, which is a set with no artwork at all.
 */
export function indexByNumber(groups: IndexableCard[][]): Record<string, CatalogueCard> {
  const byNumber: Record<string, CatalogueCard> = {};
  const put = (form: string, card: IndexableCard) => {
    const key = form.toLowerCase();
    if (key in byNumber) return;
    byNumber[key] = {
      id: card.id,
      localId: card.localId ?? "",
      name: card.name ?? "",
      image: card.image ?? null,
    };
  };
  for (const cards of groups) {
    for (const card of cards) {
      if (!card.localId) continue;
      for (const form of numberForms(card.localId)) put(form, card);
    }
  }
  // Second pass, on the numeric tail of a prefixed id. Promo sets number their cards "XY74" or
  // "SWSH001" while a collector writes the bare "74", so without this every promo is unmatched.
  // It runs after the exact forms and never overwrites them, which is what keeps a set's own
  // card 01 ahead of its Trainer Gallery's TG01.
  for (const cards of groups) {
    for (const card of cards) {
      const tail = card.localId?.match(/^[A-Za-z]+(\d+[A-Za-z]?)$/)?.[1];
      if (!tail) continue;
      for (const form of numberForms(tail)) put(form, card);
    }
  }
  return byNumber;
}
