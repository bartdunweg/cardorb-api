import { CatalogueNotFound, json } from "./tcgdex-client";
import SET_LANGUAGES from "../set-languages.generated.json";

/**
 * The Western languages a card was printed in.
 *
 * Two sources, and which one answers is a fact about the set rather than a preference.
 *
 * TCGdex keeps one catalogue per language and the Western ones share the English ids, so for a
 * set it carries, "is this card printed in German" is a 200 or a 404 at
 * /v2/de/cards/<the same id>. That is the better grain where it holds, because a card can be
 * printed in fewer languages than its set: svp-085, the Van Gogh Museum Pikachu, is English
 * alone in a promo set released in six languages.
 *
 * For the old sets those catalogues do not have the cards. Measured 2026-09-12: the Spanish and
 * Portuguese catalogues hold a record for Base Set with zero cards in it, and the Italian one
 * holds nothing for Fossil, Neo Genesis, Ruby & Sapphire or Diamond & Pearl, all of which were
 * printed in those languages. Dutch TCGdex does not keep at all, and a Dutch Base Set exists in
 * quantity. So there a 404 is a gap in a catalogue, and reading it as "never printed" is how a
 * Base Set card came to be offered four languages when it had seven.
 *
 * set-languages.generated.json is Bulbapedia's own answer per set, scraped by
 * scripts/set-languages.mjs and checked in, for the 47 pre-Black & White sets whose page says
 * it. Where it has the set it decides, outright rather than as a ceiling TCGdex may narrow: in
 * those sets a release was whole, a language got the set or it did not, so a card missing from
 * one of those catalogues is the catalogue being incomplete. Where it does not have the set,
 * TCGdex is asked per card.
 */
export const WESTERN = ["en", "de", "fr", "it", "es", "pt", "nl"] as const;
export type Western = (typeof WESTERN)[number];

/**
 * The catalogues there is any point asking.
 *
 * Dutch is not one: TCGdex keeps no Dutch catalogue, so the request could only ever 404 and the
 * 404 would mean nothing. It is a real printing language all the same — Base Set, Jungle and
 * Fossil were released in it, and nothing after — and all three of those sets are in the map
 * above, which is where Dutch is answered.
 */
const ASKED: readonly Western[] = ["en", "de", "fr", "it", "es", "pt"];

/**
 * The European run. A card printed anywhere in Europe in the modern sets is printed across it:
 * the same set, the same numbering, four languages at once. So these four answering is what says
 * a card left the English-speaking world at all.
 */
const EUROPEAN: readonly string[] = ["de", "fr", "it", "es"];

/** A catalogue that was asked and did not answer: not a 404, so not an answer either. */
const NO_ANSWER = "no-answer";

/**
 * What each catalogue says about one card, or null when no answer can be trusted.
 *
 * Null rather than a shorter list, because a catalogue that times out is the one case where the
 * two are not the same thing. Dropping it read as "this card was never printed in German" and a
 * form then offered German to nobody, which is a guess wearing a fact's clothes. A client that
 * gets null offers every language instead, the same rule it follows for a card the catalogue has
 * never heard of.
 *
 * Portuguese standing alone beside English is dropped: TCGdex' Portuguese catalogue carries
 * translations of cards that were only ever printed in English (svp-085 is one), and in the
 * modern sets a Brazilian printing never happens without the European run happening too. The old
 * sets, where Portuguese really did stand nearly alone (EX Team Rocket Returns was released in
 * English and Portuguese and nothing else), are answered by the map instead and never reach this.
 */
export async function westernLanguagesOf(tcgId: string): Promise<Western[] | null> {
  const asked = await Promise.all(
    ASKED.map(async (lang): Promise<Western | null | typeof NO_ANSWER> => {
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

/** The languages a card can be: the set's, where that is written down, and the card's otherwise. */
export async function languagesOf(tcgId: string, setId: string | null): Promise<Western[] | null> {
  const known = setId ? (SET_LANGUAGES as Record<string, string[] | undefined>)[setId] : undefined;
  if (known) return WESTERN.filter((l) => known.includes(l));
  return westernLanguagesOf(tcgId);
}
