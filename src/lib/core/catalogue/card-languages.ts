import { CatalogueNotFound, json } from "./tcgdex-client";

/**
 * The Western languages a card was printed in.
 *
 * TCGdex keeps one catalogue per language, and the Western ones share the
 * English ids: a card printed in German is at /v2/de/cards/<the same id>, and
 * one that never was is a 404 there. So the printings are not a field to look
 * up but a question to ask each catalogue, once a day. A promo like Pikachu
 * with Grey Felt Hat answers only from the English (and Portuguese) catalogue;
 * a copy of it cannot be German, and the apps offer no such choice.
 *
 * English is always in: the id is the English catalogue's. A catalogue that
 * does not answer at all (not a 404) is left out rather than guessed at.
 */
export const WESTERN = ["en", "de", "fr", "it", "es", "pt", "nl"] as const;
export type Western = (typeof WESTERN)[number];

export async function westernLanguagesOf(tcgId: string): Promise<Western[]> {
  const asked = await Promise.all(
    WESTERN.map(async (lang): Promise<Western | null> => {
      if (lang === "en") return "en";
      try {
        await json(
          `https://api.tcgdex.net/v2/${lang}/cards/${encodeURIComponent(tcgId)}`,
          `${lang} card ${tcgId}`,
        );
        return lang;
      } catch (err) {
        if (err instanceof CatalogueNotFound) return null;
        return null;
      }
    }),
  );
  return asked.filter((l): l is Western => l !== null);
}
