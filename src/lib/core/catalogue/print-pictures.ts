/**
 * A picture of each printing TCGplayer sells as a product of its own: the Poké Ball and Master Ball
 * reverses, a Japanese card's mirror holo, a cosmos holo.
 *
 * Bart, 2026-09-15: "als je een reversed holo image hebt, dat we dan ook de reversed holo kunnen
 * tonen". A card's sheet showed one scan whatever the printing, with the foil drawn over it. Where
 * TCGplayer sells a printing apart, its product has its own photo, and that photo is the printing:
 * Bulbasaur 001/165 of Pokémon Card 151 is three different scans, plain, Poké Ball and Master Ball
 * (checked by eye that day). A plain English reverse holo is no product of its own, only a price
 * under the card's one product, so it has no picture here and keeps the card's scan.
 *
 * Measured 2026-09-15: the English map (tcgplayer-patterns.generated.json) names 1,480 such
 * products over 1,058 cards; the Japanese shelf holds 2,862 printing products, 1,421 of them with a
 * picture. Base Set's Shadowless product is left out on purpose: TCGplayer's photo of Charizard
 * there is the 1st Edition print, stamp and all, so it is no picture of the Shadowless run.
 *
 * The nightly job (cron/print-pictures) copies each photo into our bucket once and writes the
 * address to card_print_pictures; the card route hands each printing its picture from there.
 */
import { finishOfName } from "../foil-pattern-products.mjs";
import type { Finish, FoilPattern } from "../collection/collection-row";
import { finishPrintsFor, patternPrintsFor } from "./card-printings";
import TCGPLAYER_PATTERNS from "../tcgplayer-patterns.generated.json";
import { type Product, cardName, extended, isPrintingLabel, labelsOf } from "./tcgplayer-japan";

/** One printing's product: the card it is a printing of, which printing, and the product. */
export type PrintProduct = { cardId: string; print: string; productId: number };

/**
 * One printing's scan from TCGdex (artwork.ts, TCGDEX_SCAN_PRINT): the card, which printing, and
 * TCGdex's folder for the scan, with `low.webp` and `high.webp` under it.
 */
export type PrintScan = { cardId: string; print: string; folder: string };

/** A printing as card_print_pictures keys it: "poke-ball", "reverse-holo", "holo/cosmos". */
export const printKey = (finish: Finish | string, foilPattern?: FoilPattern | string | null) =>
  foilPattern ? `${finish}/${foilPattern}` : finish;

/** TCGplayer's picture of a product, the address imageKey() files as `tcgplayer/<id>.jpg`. */
export const productPicture = (productId: number) =>
  `https://tcgplayer-cdn.tcgplayer.com/product/${productId}_in_1000x1000.jpg`;

/** Every English printing product the committed map names, patterned reverses and pattern holos. */
export function englishPrintProducts(): PrintProduct[] {
  const out: PrintProduct[] = [];
  for (const cardId of Object.keys(TCGPLAYER_PATTERNS)) {
    for (const p of finishPrintsFor(cardId) ?? [])
      out.push({ cardId, print: printKey(p.finish), productId: p.productId });
    for (const p of patternPrintsFor(cardId)?.prints ?? [])
      out.push({ cardId, print: printKey(p.finish, p.foilPattern), productId: p.productId });
  }
  return out;
}

/**
 * The finish a Japanese product's printing label is. "Mirror Holofoil", "Mirror Holo", "Mirror Foil"
 * and "Reverse Holofoil" are the mirror, which is this app's reverse holo; a plain "Holofoil" is the
 * holo beside a normal print; the ball, Energy Symbol and Team Rocket patterns are their own finish
 * (finishOfName). The Terastal pattern has no finish here and is left out.
 */
export function finishOfPrintingLabel(label: string): Finish | null {
  const l = label.trim();
  if (/^(mirror (holofoil|holo|foil)|reverse holo(foil)?)$/i.test(l)) return "reverse-holo";
  if (/^(holofoil|holo|foil)$/i.test(l)) return "holo";
  return (finishOfName(`(${l})`) as Finish | null) ?? null;
}

/**
 * A Japanese group's printing products, each under the card its plain product is. Products are
 * grouped the way groupCards() does (the whole printed number, the name and any label that is not a
 * printing), so a printing lands on the card it prints and never on a same-named card beside it. A
 * printing with no plain product beside it is left out: that product is the card's own picture
 * already. A product TCGplayer holds no picture of is left out too.
 */
export function japanesePrintProducts(
  products: Product[],
  /** The card each plain product is, by product id. */
  cardOf: ReadonlyMap<number, string>,
): PrintProduct[] {
  const plain = new Map<string, number>();
  const prints: { key: string; finish: Finish; productId: number }[] = [];
  for (const p of products) {
    const numbered = extended(p, "Number");
    if (!numbered && !extended(p, "Rarity") && !extended(p, "CardType")) continue;
    const [before, after] = (numbered ?? "").split("/");
    const name = cardName(p.name).toLowerCase();
    const labels = labelsOf(p.name);
    const printing = labels.filter(isPrintingLabel);
    const label = labels.filter((l) => !isPrintingLabel(l)).join(" / ");
    const key = `${numbered ? `${before?.trim()}/${after?.trim() ?? ""}` : ""}|${name}|${label}`;
    if (!printing.length) {
      plain.set(key, p.productId);
      continue;
    }
    const finish = printing.length === 1 ? finishOfPrintingLabel(printing[0]!) : null;
    if (finish && p.imageCount !== 0) prints.push({ key, finish, productId: p.productId });
  }
  const out: PrintProduct[] = [];
  const seen = new Set<string>();
  for (const { key, finish, productId } of prints) {
    const base = plain.get(key);
    const cardId = base == null ? null : cardOf.get(base);
    if (!cardId) continue;
    // One picture per printing: a second product of the same printing (a relisting) is not a second answer.
    const at = `${cardId}|${finish}`;
    if (seen.has(at)) continue;
    seen.add(at);
    out.push({ cardId, print: printKey(finish), productId });
  }
  return out;
}

/**
 * The scans of a set TCGdex photographed as one printing, for the cards that exist in that
 * printing. A card without it (a rare, scanned plain) is left out: its scan is no picture of a
 * printing it never had.
 */
export function tcgdexPrintScans(
  cards: { id: string; image?: string | null }[],
  print: Finish,
  /** Each card's variants as the copy holds them (TCGdex's: `{ type: "reverse", foil: "pokeball" }`). */
  variantsOf: ReadonlyMap<string, { type?: string; foil?: string }[] | null>,
): PrintScan[] {
  const foil = print.replace("-", "");
  return cards.flatMap((c) =>
    c.image?.startsWith("https://assets.tcgdex.net/") &&
    (variantsOf.get(c.id) ?? []).some((v) => v.type === "reverse" && v.foil === foil)
      ? [{ cardId: c.id, print: printKey(print), folder: c.image }]
      : [],
  );
}

/**
 * The printings with their picture where card_print_pictures holds one, by printKey. A printing
 * with none carries null, and the card's own scan stands for it.
 */
export function withPrintPictures<P extends { finish: string; foilPattern?: string | null }>(
  printings: P[] | null | undefined,
  pictures: ReadonlyMap<string, string>,
): (P & { image: string | null })[] | null | undefined {
  if (!printings) return printings as null | undefined;
  return printings.map((p) => ({
    ...p,
    image: pictures.get(printKey(p.finish, p.foilPattern)) ?? null,
  }));
}
