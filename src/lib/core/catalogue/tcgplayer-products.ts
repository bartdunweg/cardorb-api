/**
 * What TCGplayer's own product says about an English card, read at night for the copy (mirror.ts).
 *
 * Two facts TCGdex leaves out or cannot say, both measured on 2026-09-14 across the 21,068 English
 * cards through the product links (tcgplayer-ids.generated.json):
 *
 * - **stage**: 833 Pokémon had none, 810 of them an ex, EX or GX (Feraligatr ex, ex10-103; Mew-EX,
 *   bw11-RC24). TCGplayer's product names one for every one of them, and pokemontcg.io agrees on
 *   825. Of the six where they differ, TCGplayer is wrong about five (Yveltal GX a Stage 1,
 *   Incineroar GX a Basic), which card-fact-corrections.ts writes before this fills, and right
 *   about Clefable ex.
 * - **full art**: 72 cards whose product TCGplayer names "Jolteon V (Full Art)" (swsh7-177),
 *   "Piers (Full Art)" (swsh4.5-69) or "Grass Energy (Texture Full Art)" (swsh12.5-152), which the
 *   rule in full-art.ts misses because nothing else in their set is the same name.
 *
 * - **rarity**: TCGplayer's word, for the rule in tcgplayer-rules.mjs (tcgplayerRarity): a card TCGdex
 *   names no rarity for, or a plain Rare of a card TCGplayer grades higher.
 *
 * One read of tcgcsv per group a set's cards are linked into, usually one, so a set costs a request
 * or two. A group that does not answer throws: a set written without these would lose its stages
 * and full arts until the next night, where a set not written keeps last night's.
 */
import TCGPLAYER_IDS from "../tcgplayer-ids.generated.json";
import TCGPLAYER_GROUPS from "../tcgplayer-groups.generated.json";
import { rarityOfProduct } from "../tcgplayer-rules.mjs";
import { mapLimit } from "../util";
import { groupProducts, TCGCSV_CATEGORY } from "./tcgcsv";

const PRODUCTS = TCGPLAYER_IDS as Record<string, { productId?: number } | null>;
const GROUPS =
  (TCGPLAYER_GROUPS as Record<string, Record<string, number>>)[String(TCGCSV_CATEGORY.en)] ?? {};

/** A card's product as the copy reads it. */
export type ProductFacts = {
  /** "Jolteon V (Full Art)". */
  name: string;
  /** TCGplayer's stage in TCGdex's words ("Stage1"), or null where it has none this can read. */
  stage: string | null;
  /** TCGplayer's rarity word ("Holo Rare", "Classic Collection"), or null (tcgplayerRarity reads it). */
  rarity: string | null;
};

/**
 * TCGplayer's stage words in TCGdex's: the spellings the copy already holds for the cards both name
 * (2026-09-14). TCGplayer writes one stage several ways ("Level Up" and "Level-Up", "Mega" and
 * "Primal", "Stage 1" and "1"); a word not listed here fills nothing.
 */
const STAGE_WORDS: Readonly<Record<string, string>> = {
  basic: "Basic",
  "stage 1": "Stage1",
  "1": "Stage1",
  "stage 2": "Stage2",
  vmax: "VMAX",
  gigantamax: "VMAX",
  vstar: "VSTAR",
  "v-union": "V-UNION",
  mega: "MEGA",
  "mega evolution": "MEGA",
  primal: "MEGA",
  "level up": "LEVEL-UP",
  "level-up": "LEVEL-UP",
  "break evolution": "BREAK",
  restored: "RESTORED",
  baby: "Baby",
  legend: "LEGEND",
};

export const tcgdexStage = (stage: string | null | undefined): string | null =>
  (stage && STAGE_WORDS[stage.trim().toLowerCase()]) || null;

/** Every linked card's product facts, by card id. Cards with no product are left out. */
export async function productFactsOf(cardIds: string[]): Promise<Map<string, ProductFacts>> {
  const byGroup = new Map<number, Map<number, string[]>>();
  for (const id of cardIds) {
    const productId = PRODUCTS[id]?.productId;
    const groupId = productId == null ? undefined : GROUPS[String(productId)];
    if (productId == null || groupId == null) continue;
    const products = byGroup.get(groupId) ?? new Map<number, string[]>();
    products.set(productId, [...(products.get(productId) ?? []), id]);
    byGroup.set(groupId, products);
  }
  const out = new Map<string, ProductFacts>();
  await mapLimit([...byGroup], 2, async ([groupId, wanted]) => {
    for (const product of await groupProducts(groupId)) {
      const ids = wanted.get(product.productId);
      if (!ids) continue;
      const stage = product.extendedData?.find((e) => e.name === "Stage")?.value;
      const rarity = rarityOfProduct(product);
      for (const id of ids) out.set(id, { name: product.name, stage: tcgdexStage(stage), rarity });
    }
  });
  return out;
}
