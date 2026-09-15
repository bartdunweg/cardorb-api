/**
 * Cards the catalogues' own lists lack, read by hand, that the copy adds to their sets.
 *
 * Found on 2026-09-15 by laying every set beside Bulbapedia's set lists (the naming pass), and each
 * checked against the printed card on a TCGplayer or Scrydex picture:
 *
 * - **English, 91 cards.** 56 Yellow A Alternate cards of the Sun & Moon sets (Tapu Lele-GX 60a of
 *   Guardians Rising, SM30a Tapu Koko), filed under the set they print as TCGdex files the XY ones
 *   (xy2-88a); the twelve Fighting Energy of the Lycanroc half deck (tk-sm-l); 22 MEP promos from
 *   089 to 110 and 120 Celebratory Fanfare. TCGdex lists none of them. Facts from the parent card at
 *   TCGdex (HP, types, stage), the artist and the rarity mark from Scrydex, the product from
 *   TCGplayer; the picture is TCGplayer's product, Scrydex's where TCGplayer shows none. MEP 115 to
 *   117 are not here: no source has a picture or a product for them yet (Delta Reign, 2026-11-06).
 * - **Japanese, 25 cards.** The basic Energy Sun & Moon (SM1p), Ultra Force (SM5p) and Tag All Stars
 *   (SM12a) put in their packs, which print a code where a number would be ("SM12a GRA") and are
 *   filed under it; SV-P 147, 154 and 291 and M-P 135, 136 and 147 from Scrydex; M-P 052 and 082 from
 *   TCGplayer, which sells them without a picture yet.
 *
 * `product` is the TCGplayer product a price is read from (tcgplayer-ids.generated.json and
 * tcgplayer-ids.ja.generated.json carry the same link), `image` the picture copied into our bucket.
 */
import EXTRA from "./extra-cards.json";

export type ExtraCard = {
  set: string;
  number: string;
  name: string;
  localName?: string;
  category: string;
  trainerType?: string;
  stage?: string;
  hp?: number;
  types: string[];
  rarity?: string;
  evolveFrom?: string;
  illustrator?: string;
  product?: number;
  image?: string;
  /** TCGdex counts the card in its set's total already, and lists no card for it (tk-sm-l). */
  counted?: boolean;
};

const TABLE = EXTRA as unknown as Record<"en" | "ja", Record<string, ExtraCard>>;

/** The cards added to one set of a catalogue, by the id the copy files them under. */
export const extraCardsOf = (language: "en" | "ja", setId: string): [string, ExtraCard][] =>
  Object.entries(TABLE[language]).filter(([, c]) => c.set === setId);

/** Every added card of a catalogue, for the tests. */
export const EXTRA_CARDS = TABLE;
