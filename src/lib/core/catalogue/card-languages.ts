import { CatalogueNotFound, json } from "./tcgdex-client";

/**
 * The Western languages a card was printed in.
 *
 * TCGdex keeps one catalogue per language, and the Western ones share the
 * English ids: a card printed in German is at /v2/de/cards/<the same id>, and
 * one that never was is a 404 there. So the printings are not a field to look
 * up but a question to ask each catalogue, once a day.
 *
 * English is always in: the id is the English catalogue's.
 */
/**
 * Dutch is not here. No Pokémon card has been printed in it, TCGdex keeps no Dutch catalogue, so
 * the question was six words of URL that could only ever 404, and on the path where nothing
 * could answer the apps offered Dutch as a printing. `nl` stays a value the store accepts, for
 * an import that carries one; it is not a printing this can find.
 */
export const WESTERN = ["en", "de", "fr", "it", "es", "pt"] as const;
export type Western = (typeof WESTERN)[number];

/**
 * The European run. A card printed anywhere in Europe is printed across it:
 * the same set, the same numbering, four languages at once. So these four
 * answering is what says a card left the English-speaking world at all.
 */
const EUROPEAN: readonly string[] = ["de", "fr", "it", "es"];

/** A catalogue that was asked and did not answer: not a 404, so not an answer either. */
const NO_ANSWER = "no-answer";

/**
 * What each catalogue says, or null when no answer can be trusted.
 *
 * Null rather than a shorter list, because a catalogue that times out is the
 * one case where the two are not the same thing. Dropping it read as "this card
 * was never printed in German" and a form then offered German to nobody, which
 * is a guess wearing a fact's clothes. A client that gets null offers every
 * language instead, the same rule it follows for a card the catalogue has never
 * heard of.
 *
 * Portuguese standing alone beside English is dropped: TCGdex' Portuguese
 * catalogue carries translations of cards that were only ever printed in
 * English (svp-085, Pikachu with Grey Felt Hat, is one), and a Brazilian
 * printing never happens without the European run happening too. So Portuguese
 * counts when at least one of German, French, Italian or Spanish counts, and
 * reads as a translation when it does not.
 */
export async function westernLanguagesOf(tcgId: string): Promise<Western[] | null> {
  const asked = await Promise.all(
    WESTERN.map(async (lang): Promise<Western | null | typeof NO_ANSWER> => {
      if (lang === "en") return "en";
      try {
        await json(
          `https://api.tcgdex.net/v2/${lang}/cards/${encodeURIComponent(tcgId)}`,
          `${lang} card ${tcgId}`,
        );
        return lang;
      } catch (err) {
        if (err instanceof CatalogueNotFound) return null;
        console.error(`TCGdex ${lang} could not say whether ${tcgId} is printed in it:`, err);
        return NO_ANSWER;
      }
    }),
  );
  if (asked.includes(NO_ANSWER)) return null;
  const printed = asked.filter((l): l is Western => l !== null && l !== NO_ANSWER);
  if (printed.includes("pt") && !printed.some((l) => EUROPEAN.includes(l))) {
    return printed.filter((l) => l !== "pt");
  }
  return printed;
}
