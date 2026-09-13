/**
 * A set's gallery, shown as part of the set on the English shelf.
 *
 * TCGdex files a Sword & Shield set's Trainer Gallery, and Crown Zenith's Galarian Gallery, as a
 * set of its own ("Brilliant Stars Trainer Gallery", TG01 to TG30), because the cards are numbered
 * apart; pokemontcg.io and TCGplayer do the same. The collection has long filed them under the
 * parent (ownership.ts, set-aliases.ts galleryParent), the way a collector thinks of them: the same
 * boosters, the same set symbol. The shelf listed them apart, and Bart asked why (2026-09-13).
 * So the shelf folds a gallery into its parent: the parent's page carries the gallery's cards after
 * its own, its counts include them, and the gallery is not a tile of its own. A gallery's own id
 * still answers its page, so an address kept from before goes on working.
 */
import { galleryParent } from "./set-aliases";
import type { CatalogueSet } from "./tcgdex-browse";

/** Each parent's gallery by the parent's id, for the galleries whose parent is on the shelf. */
export function galleriesByParent(sets: CatalogueSet[]): Map<string, CatalogueSet> {
  const byName = new Map(sets.map((s) => [s.name.toLowerCase(), s]));
  const out = new Map<string, CatalogueSet>();
  for (const set of sets) {
    const parentName = galleryParent(set.name);
    const parent = parentName ? byName.get(parentName.toLowerCase()) : undefined;
    if (parent) out.set(parent.id, set);
  }
  return out;
}

/** The shelf without the galleries that are shown inside their parent. */
export function withoutFoldedGalleries(
  sets: CatalogueSet[],
  galleries: Map<string, CatalogueSet>,
): CatalogueSet[] {
  const folded = new Set([...galleries.values()].map((g) => g.id));
  return sets.filter((s) => !folded.has(s.id));
}
