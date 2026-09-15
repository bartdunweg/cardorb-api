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
} from "@/lib/storage/postgres";
import type { CardDetail } from "../collection/cards";
import { editionsOf, printingsOf } from "./card-printings";
import { WESTERN, type Western } from "./card-languages";
import { ownPicture } from "./image-store";

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
export function detailFromSheet(
  { card, set }: CatalogueCardSheet,
  /** The catalogue the sheet is from: TCGplayer's patterned reverses are read for English cards. */
  language: CatalogueLanguage = "en",
): CardDetail {
  return {
    id: card.id,
    // A Japanese card's sheet has always carried the name it prints, as TCGdex's record says it.
    name: card.local_name ?? card.name,
    // Only a file of ours: the copy holds nothing else today, and an address from another host
    // that ever reached it would be no picture (ownPicture).
    image: ownPicture(card.image),
    rarity: card.rarity,
    illustrator: card.illustrator,
    hp: card.hp,
    types: card.types ?? [],
    stage: card.stage,
    evolveFrom: card.evolve_from,
    regulationMark: card.regulation_mark,
    firstEdition: card.first_edition,
    printings: printingsOf(card.variants, language === "en" ? card.id : null),
    editions: editionsOf(card.id, card.first_edition),
    set: set
      ? {
          id: set.id,
          name: set.local_name ?? set.name,
          logo: ownPicture(set.logo),
          total: set.total,
        }
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
