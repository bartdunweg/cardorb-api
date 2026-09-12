import { CatalogueNotFound, fetchSet, graphql } from "./tcgdex-client";
import { rarityOrNull } from "../collection/collection-row";

/**
 * The rarities an era actually printed.
 *
 * A promo carries no rarity symbol, so every catalogue answers "Promo" for a
 * whole promo set and the owner is the only one who can say what the card is
 * (see rarityOrNull, and CardRarityField on the web). What the apps offered was
 * one fixed list of ten, the same on every card, so a black star promo from
 * 1999 was offered "Special illustration rare", a word the game did not have
 * until 2023.
 *
 * The era knows better, and the catalogue knows the era: a card's set belongs
 * to a TCGdex series ("sv", "base"), and the rarities on the cards of that
 * series are the ones that era printed. Measured rather than written down, so a
 * new era brings its own vocabulary with it and nobody has to remember to add
 * it.
 *
 * "Promo" and "None" are left out: they are what a catalogue writes where it
 * has no rarity, which is the question being asked, not an answer to it.
 */

/** The cards of one set, rarity only: 500 is TCGdex' page ceiling and no set is near it. */
const perSet = (alias: string, setId: string): string =>
  `${alias}: cards(filters: { id: ${JSON.stringify(`${setId}-`)} }, pagination: { page: 1, itemsPerPage: 500 }) { rarity }`;

/** The series a set belongs to, as TCGdex files it: "svp" is in "sv". */
export async function serieOfSet(setId: string): Promise<string | null> {
  const detail = await fetchSet(setId);
  return detail?.serie?.id ?? null;
}

/**
 * Every rarity the sets of one series carry, A to Z.
 *
 * One GraphQL call for the whole era, whatever its size: a field per set, all
 * aliased into a single query, because a series runs to twenty-six sets and
 * that would otherwise be twenty-six round trips behind an open sheet. The
 * `id` filter is a contains match, so each field is asked for "sv01-" with the
 * dash: "sv03-" does not match sv03.5's cards.
 */
export async function loadEraRarities(serieId: string): Promise<string[]> {
  const serie = (await graphql(
    `{ serie(id: ${JSON.stringify(serieId)}) { sets { id } } }`,
    `serie ${serieId}`,
  )) as { serie?: { sets?: { id: string }[] | null } | null } | null;
  const sets = (serie?.serie?.sets ?? []).map((s) => s.id);
  if (sets.length === 0) return [];

  const body = (await graphql(
    `{ ${sets.map((id, i) => perSet(`s${i}`, id)).join(" ")} }`,
    `serie ${serieId} rarities`,
  )) as Record<string, { rarity?: string | null }[] | null> | null;

  const found = new Set<string>();
  for (let i = 0; i < sets.length; i++) {
    for (const card of body?.[`s${i}`] ?? []) {
      const rarity = rarityOrNull(card?.rarity);
      if (rarity) found.add(rarity);
    }
  }
  return [...found].sort((a, b) => a.localeCompare(b));
}

/**
 * The rarities the era of one set printed, or null where the catalogue could
 * not say. Null rather than an empty list: a client offers everything then,
 * rather than a control with nothing in it.
 */
export async function eraRaritiesOfSet(
  setId: string,
  cached: (serieId: string) => Promise<string[]>,
): Promise<string[] | null> {
  try {
    const serieId = await serieOfSet(setId);
    if (!serieId) return null;
    const rarities = await cached(serieId);
    return rarities.length ? rarities : null;
  } catch (err) {
    if (err instanceof CatalogueNotFound) return null;
    console.error(`The rarities of ${setId}'s era could not be read:`, err);
    return null;
  }
}
