/**
 * The code a set goes by where TCGdex publishes no official abbreviation.
 *
 * The official abbreviation (`abbreviation.official`, "BS", "SVP") is The Pokémon Company's and is
 * what every list shows beside a card's number. Fifteen English sets have none. Four of them have
 * the code Pokémon TCG Online used for them, which TCGdex publishes as `tcgOnline` (checked against
 * api.tcgdex.net on 2026-09-15), and that is the same publisher's code, so it stands in. The others
 * (SWSH promos, Shiny Vault, Radiant Collection and the like) print their code inside the number
 * ("SWSH282", "SV49"), so they need none; the rest (Jumbo cards, samples) have no code anywhere.
 */
const TCG_ONLINE_CODES: Record<string, string> = {
  basep: "PR",
  np: "PR-NP",
  dpp: "PR-DPP",
  hgssp: "PR-HS",
};

/** A set's code: its official abbreviation, or Pokémon TCG Online's where there is none. */
export function setCodeOf(
  setId: string | null | undefined,
  abbreviation: string | null | undefined,
): string | null {
  return abbreviation ?? (setId ? (TCG_ONLINE_CODES[setId] ?? null) : null);
}

/**
 * The number as the card prints it, out of the catalogue's card id: "XY124" from `xyp-XY124`,
 * "085" from `svp-085`, "4" from `base1-4`. A card id is the set's id, a dash and the printed
 * number; a set id can hold a dash (the sets of 895 cards do) and a printed number never does (0 of 37,951 on 2026-09-15), so the number is what follows the last dash. One id
 * escapes its number (`exu-%3F` is Unown "?"). Null without an id.
 */
export function printedNumberOf(tcgId: string | null | undefined): string | null {
  if (!tcgId) return null;
  const at = tcgId.lastIndexOf("-");
  if (at < 0 || at === tcgId.length - 1) return null;
  const raw = tcgId.slice(at + 1);
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
