/**
 * A card's sheet out of the copy (catalogue_cards), so opening a card asks nobody.
 *
 * Bart, 2026-09-14: every page reads our own store, and the sources are asked at night for what is
 * new. The sheet was the one read still going to TCGdex on every open: the card's record, the five
 * Western catalogues for its languages, the set's record for its era and GraphQL for that era's
 * rarities. The nightly copy keeps all of it now (mirror.ts, migration 20260914220000).
 *
 * English and Japanese, the two catalogues the copy holds. A card the copy does not hold, or holds
 * from before it kept sheets, is null here, and the route asks TCGdex as it did (getCardDetail).
 */
import { adminClient } from "@/lib/storage/supabase";
import {
  type CatalogueCardSheet,
  type CatalogueLanguage,
  catalogueCardSheet,
  catalogueEraRarities,
} from "@/lib/storage/postgres";
import type { CardDetail } from "../collection/cards";
import { editionsOf, printingsOf } from "./card-printings";
import { WESTERN, type Western } from "./card-languages";
import { rarityOrNull } from "../collection/collection-row";

/** The copy's sheet for one English card, or null where the copy has none or will not answer. */
export async function readCardSheet(
  tcgId: string,
  language: CatalogueLanguage = "en",
): Promise<CatalogueCardSheet | null> {
  const db = adminClient();
  if (!db) return null;
  return catalogueCardSheet(db, tcgId, language).catch((err) => {
    console.error(`The copy could not give ${tcgId}'s sheet, asking TCGdex:`, err);
    return null;
  });
}

/**
 * The sheet as getCardDetail() answers it. No price: the route prices every card from the one
 * store (detailPrice). No Cardmarket id: nothing reads it since prices are TCGplayer's alone.
 */
export function detailFromSheet({ card, set }: CatalogueCardSheet): CardDetail {
  return {
    id: card.id,
    // A Japanese card's sheet has always carried the name it prints, as TCGdex's record says it.
    name: card.local_name ?? card.name,
    image: card.image,
    rarity: card.rarity,
    illustrator: card.illustrator,
    hp: card.hp,
    types: card.types ?? [],
    stage: card.stage,
    evolveFrom: card.evolve_from,
    regulationMark: card.regulation_mark,
    firstEdition: card.first_edition,
    printings: printingsOf(card.variants),
    editions: editionsOf(card.id, card.first_edition),
    set: set
      ? { id: set.id, name: set.local_name ?? set.name, logo: set.logo, total: set.total }
      : { id: card.set_id, name: card.set_name, logo: null, total: null },
    cmId: null,
    cmUrl: null,
    price: null,
    tcgplayerId: null,
    market: null,
  };
}

/** The languages the copy recorded, in WESTERN order; null where it could not say. */
export const languagesFromSheet = ({ card }: CatalogueCardSheet): Western[] | null =>
  card.languages ? WESTERN.filter((l) => card.languages?.includes(l)) : null;

/** The rarities of the card's era out of the copy, or null where it holds none or will not answer. */
export async function eraRaritiesFromCopy(
  setId: string,
  language: CatalogueLanguage = "en",
): Promise<string[] | null> {
  const db = adminClient();
  if (!db) return null;
  const rarities = await catalogueEraRarities(db, setId, language).catch((err) => {
    console.error(`The copy could not give ${setId}'s era rarities:`, err);
    return [] as string[];
  });
  const named = rarities.filter((r) => rarityOrNull(r) !== null);
  return named.length ? named : null;
}
