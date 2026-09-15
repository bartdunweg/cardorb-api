/**
 * Set facts the catalogues have wrong, read by hand and put right wherever the copy writes a set.
 *
 * Found on 2026-09-14 by laying every set beside TCGplayer's groups and Scrydex's expansions, where
 * both agreed against TCGdex: CP5 and SV4a carried other sets' Japanese names (XY11b's and SV3a's),
 * and nine release dates were off by up to a year (XY3 wore XY4's, which put it after XY4 on the
 * shelf). Keyed by language and TCGdex's set id; a field left out is TCGdex's.
 */
export type SetCorrection = {
  name?: string;
  local_name?: string;
  release_date?: string;
  printed_total?: number;
};

const CORRECTIONS: Record<string, SetCorrection> = {
  "ja:CP5": { local_name: "幻・伝説ドリームキラコレクション" },
  "ja:SV4a": { local_name: "シャイニートレジャーex" },
  // The pack prints its title in Latin capitals (pokemon-card.com, 拡張パック「25th ANNIVERSARY COLLECTION」);
  // TCGdex writes it in katakana (2026-09-15).
  "ja:S8a": { local_name: "25th ANNIVERSARY COLLECTION" },
  "ja:XY3": { release_date: "2014/06/14" },
  "ja:SM7a": { release_date: "2018/07/06", printed_total: 60 },
  "ja:SM8b": { release_date: "2018/11/02" },
  // PMCG1 is "Expansion Pack" too; TCGplayer and Scrydex call this one ADV Expansion Pack.
  "ja:ADV1": { name: "ADV Expansion Pack" },
  /* English titles where Bulbapedia and Scrydex agree against TCGdex's own translation (naming pass,
     2026-09-14): "Beyond a New Challenge" is Facing a New Trial, "Explosive Fighter" Fever-Burst
     Fighter, and the vintage titles end in three dots, not an ellipsis. */
  "ja:SM2p": { name: "Facing a New Trial" },
  "ja:sm2+": { name: "Facing a New Trial" },
  "ja:PCG7": { name: "Holon Phantom" },
  "ja:CP4": { name: "Premium Champion Pack" },
  "ja:XY11a": { name: "Fever-Burst Fighter" },
  "ja:SM0": { name: "Pikachu's New Friends" },
  "ja:SM7": { name: "Sky-Splitting Charisma" },
  "ja:S5a": { name: "Peerless Fighters" },
  "ja:neo1": { name: "Gold, Silver, to a New World..." },
  "ja:neo2": { name: "Crossing the Ruins..." },
  "ja:neo4": { name: "Darkness, and to Light..." },
  "ja:M2a": { name: "MEGA Dream ex" },
  "en:det1": { release_date: "2019/04/05" },
  "en:sv10.5w": { release_date: "2025/07/18" },
  "en:sv10.5b": { release_date: "2025/07/18" },
  "en:2017sm": { release_date: "2017/11/07" },
  "en:2023sv": { release_date: "2023/09/11" },
  "en:2024sv": { release_date: "2025/01/21" },
  "en:bog": { name: "Best of Game" },
  /* Naming pass against Bulbapedia's set lists (2026-09-15), where Bulbapedia and TCGplayer's group
     agree against TCGdex. The EX sets carry the EX their packs print ("EX Ruby & Sapphire"), which is
     also how the owner's collection files 285 cards of them. A trainer kit is a Trainer Kit. */
  "en:ex1": { name: "EX Ruby & Sapphire" },
  "en:ex2": { name: "EX Sandstorm" },
  "en:ex3": { name: "EX Dragon" },
  "en:ex4": { name: "EX Team Magma vs Team Aqua" },
  "en:ex5": { name: "EX Hidden Legends" },
  "en:ex6": { name: "EX FireRed & LeafGreen" },
  "en:ex7": { name: "EX Team Rocket Returns" },
  "en:ex8": { name: "EX Deoxys" },
  "en:ex9": { name: "EX Emerald" },
  "en:ex10": { name: "EX Unseen Forces" },
  "en:ex11": { name: "EX Delta Species" },
  "en:ex12": { name: "EX Legend Maker" },
  "en:ex13": { name: "EX Holon Phantoms" },
  "en:ex14": { name: "EX Crystal Guardians" },
  "en:ex15": { name: "EX Dragon Frontiers" },
  "en:ex16": { name: "EX Power Keepers" },
  "en:tk-ex-latia": { name: "EX Trainer Kit (Latias)" },
  "en:tk-ex-latio": { name: "EX Trainer Kit (Latios)" },
  "en:tk-ex-m": { name: "EX Trainer Kit 2 (Minun)" },
  "en:tk-ex-p": { name: "EX Trainer Kit 2 (Plusle)" },
  "en:tk-dp-l": { name: "DP Trainer Kit (Lucario)" },
  "en:tk-dp-m": { name: "DP Trainer Kit (Manaphy)" },
  "en:tk-hs-g": { name: "HS Trainer Kit (Gyarados)" },
  "en:tk-hs-r": { name: "HS Trainer Kit (Raichu)" },
  "en:tk-bw-e": { name: "BW Trainer Kit (Excadrill)" },
  "en:tk-bw-z": { name: "BW Trainer Kit (Zoroark)" },
  "en:tk-xy-n": { name: "XY Trainer Kit (Noivern)" },
  "en:tk-xy-sy": { name: "XY Trainer Kit (Sylveon)" },
  "en:tk-xy-b": { name: "XY Trainer Kit (Bisharp)" },
  "en:tk-xy-w": { name: "XY Trainer Kit (Wigglytuff)" },
  "en:tk-xy-latia": { name: "XY Trainer Kit (Latias)" },
  "en:tk-xy-latio": { name: "XY Trainer Kit (Latios)" },
  "en:tk-xy-p": { name: "XY Trainer Kit (Pikachu Libre)" },
  "en:tk-xy-su": { name: "XY Trainer Kit (Suicune)" },
  "en:tk-sm-l": { name: "SM Trainer Kit (Lycanroc)" },
  "en:tk-sm-r": { name: "SM Trainer Kit (Alolan Raichu)" },
  /* Japanese titles where Bulbapedia and TCGplayer's Japanese group agree against TCGdex's (and
     Scrydex's) own: Transformation Mask, Terastal Fest ex, the Stellar Miracle Deck Build Box, the
     Stellar Tera Type Starter Sets, Great Detective Pikachu, the SV-P and M-P Promotional cards; Pokémon
     VS and Pokémon Web as Scrydex and TCGplayer write them and Bulbapedia titles their pages (the
     logo's star, "Pokémon Card★VS", is its lists' only). */
  "ja:SV6": { name: "Transformation Mask" },
  "ja:SV8a": { name: "Terastal Fest ex" },
  "ja:SVK": { name: "Stellar Miracle Deck Build Box" },
  "ja:SVLN": { name: "Stellar Tera Type Starter Set Sylveon ex" },
  "ja:SVLS": { name: "Stellar Tera Type Starter Set Ceruledge ex" },
  "ja:SMP2": { name: "Great Detective Pikachu" },
  "ja:SV-P": { name: "SV-P Promotional cards" },
  "ja:M-P": { name: "M-P Promotional cards" },
  "ja:VS1": { name: "Pokémon VS" },
  "ja:web1": { name: "Pokémon Web" },
  /* The total a set's cards print after the slash, off the cards (TCGplayer's and Scrydex's
     pictures, 2026-09-15), where TCGdex counts something else: Reviving Legends and Clash at the
     Summit print 080, Thunderclap Spark 060 (with its date, above), Sky Legend 054, Black Bolt 086. */
  "ja:L2": { printed_total: 80 },
  "ja:L3": { printed_total: 80 },
  "ja:SM10b": { printed_total: 54 },
  "ja:SV11B": { printed_total: 86 },
};

/** The set as the copy should hold it: TCGdex's answer with any correction read by hand laid over it. */
export function correctedSet<T extends { id: string; name: string; language?: string }>(set: T): T {
  const fix = CORRECTIONS[`${set.language ?? "en"}:${set.id}`];
  return fix ? { ...set, ...fix } : set;
}

/** Every correction, for the migration that puts the copy right today and for the tests. */
export const SET_CORRECTIONS = CORRECTIONS;
