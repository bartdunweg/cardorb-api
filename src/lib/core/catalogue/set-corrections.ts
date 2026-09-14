/**
 * Set facts the catalogues have wrong, read by hand and put right wherever the copy writes a set.
 *
 * Found on 2026-09-14 by laying every set beside TCGplayer's groups and Scrydex's expansions, where
 * both agreed against TCGdex: CP5 and SV4a carried other sets' Japanese names (XY11b's and SV3a's),
 * and nine release dates were off by up to a year (XY3 wore XY4's, which put it after XY4 on the
 * shelf). Keyed by language and TCGdex's set id; a field left out is TCGdex's.
 */
export type SetCorrection = { name?: string; local_name?: string; release_date?: string };

const CORRECTIONS: Record<string, SetCorrection> = {
  "ja:CP5": { local_name: "幻・伝説ドリームキラコレクション" },
  "ja:SV4a": { local_name: "シャイニートレジャーex" },
  "ja:XY3": { release_date: "2014/06/14" },
  "ja:SM7a": { release_date: "2018/07/06" },
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
};

/** The set as the copy should hold it: TCGdex's answer with any correction read by hand laid over it. */
export function correctedSet<T extends { id: string; name: string; language?: string }>(set: T): T {
  const fix = CORRECTIONS[`${set.language ?? "en"}:${set.id}`];
  return fix ? { ...set, ...fix } : set;
}

/** Every correction, for the migration that puts the copy right today and for the tests. */
export const SET_CORRECTIONS = CORRECTIONS;
