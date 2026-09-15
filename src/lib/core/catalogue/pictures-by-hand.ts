/**
 * Pictures no source the nightly copy asks has, found by hand and committed with their source.
 *
 * Bart, 2026-09-15: a card or a set that TCGdex, TCGplayer, Scrydex, Limitless and pokemontcg.io
 * have no picture for may take one from elsewhere, Bulbapedia first ("als je ze ergens anders kunt
 * vinden ... dan moeten we dat maar doen"). Bulbapedia refuses requests from hosted runners, so the
 * files are not fetched at night: each is downloaded once, looked at, and committed under
 * public/pictures-by-hand/, with the page it came from in pictures-by-hand.json. This deployment
 * serves them, and the nightly copy puts them in our bucket like any other picture (image-store.ts
 * imageKey, `hand/`), only for a card or set that is still blank after every other source.
 */
import HAND from "./pictures-by-hand.json";

/** One picture found by hand: the committed file, and where it was found. */
export type HandPicture = {
  /** Under public/pictures-by-hand/. */
  file: string;
  /** The file's own address where it was downloaded from. */
  source: string;
  /** The page that names it as this card's or set's picture. */
  page: string;
  note?: string;
};

type Shelf = "en" | "ja";
const TABLE = HAND as {
  cards: Record<Shelf, Record<string, HandPicture>>;
  logos: Record<Shelf, Record<string, HandPicture>>;
};

/** Where this deployment serves the committed files. */
export const HAND_ORIGIN = "https://api.cardorb.com/pictures-by-hand";

const addressOf = (entry: HandPicture | undefined): string | null =>
  entry ? `${HAND_ORIGIN}/${entry.file}` : null;

/** A card's picture found by hand, as the address the copy asks for, or null. */
export const handCardPicture = (language: Shelf, id: string): string | null =>
  addressOf(TABLE.cards[language]?.[id]);

/** A set's logo found by hand, as the address the copy asks for, or null. */
export const handSetLogo = (language: Shelf, id: string): string | null =>
  addressOf(TABLE.logos[language]?.[id]);

/** Every entry, for the test that each names a committed file. */
export const handEntries = (): HandPicture[] =>
  (["cards", "logos"] as const).flatMap((kind) =>
    (["en", "ja"] as const).flatMap((lang) => Object.values(TABLE[kind][lang])),
  );
