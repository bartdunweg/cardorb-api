import type { Finish, Language } from "../collection/collection-row";
import { mapLimit } from "../util";
import { printingsOf, type Printing, type TcgVariant } from "./card-printings";
import { json } from "./tcgdex-client";
import { cataloguesFor, isTcgId } from "./tcgdex-language";

/**
 * The finish a copy you own gets when nobody said which.
 *
 * A copy you own always has a finish since 2026-09-13, and the store refuses one without it
 * (20260913140000_owned_copy_has_a_finish.sql). An empty finish was never "not recorded" in any
 * way that helped: it bought no price, and two copies that differed only in the finish nobody
 * wrote down were the same row to fold_card, which is how a normal and a reverse holo of seven
 * cards became one copy of two.
 *
 * The catalogue's only printing where it has exactly one (a Special Illustration Rare is a holo
 * and nothing else), `normal` where it has several or none. Normal is a guess on a card that
 * also comes as a reverse, and the right one on most: a reverse is the copy somebody notices
 * and says.
 */
export function defaultFinish(printings: readonly Printing[]): Finish {
  const finishes = new Set(printings.map((p) => p.finish));
  return finishes.size === 1 ? [...finishes][0]! : "normal";
}

/**
 * The same, asked of TCGdex for one card. The per-card record is cached for a day, so the card
 * a sheet has just shown costs nothing here. Anything that is not an answer (no id, an id TCGdex
 * does not have, an outage) is `normal`: a card is never refused for a finish nobody chose.
 */
export async function defaultFinishFor(
  tcgId: string | null | undefined,
  language: Language | null | undefined,
): Promise<Finish> {
  if (!isTcgId(tcgId)) return "normal";
  const catalogue = cataloguesFor(language)[0] ?? "en";
  try {
    const card = (await json(
      `https://api.tcgdex.net/v2/${catalogue}/cards/${encodeURIComponent(tcgId)}`,
      `${catalogue} card ${tcgId}`,
    )) as { variants_detailed?: TcgVariant[] } | null;
    return defaultFinish(printingsOf(card?.variants_detailed));
  } catch {
    return "normal";
  }
}

/**
 * Every owned row without a finish given one, asking TCGdex once per card and six at a time.
 * For an import, where a file names no finish on hundreds of lines of the same few sets.
 */
export async function withDefaultFinishes<
  T extends {
    owned: boolean;
    finish: Finish | null;
    tcgId: string | null;
    language: Language | null;
  },
>(rows: T[]): Promise<T[]> {
  const key = (r: T) => `${r.language ?? ""}|${r.tcgId ?? ""}`;
  const wanted = [
    ...new Map(rows.filter((r) => r.owned && !r.finish).map((r) => [key(r), r])).values(),
  ];
  if (!wanted.length) return rows;
  const answers = new Map(
    await mapLimit(
      wanted,
      6,
      async (r) => [key(r), await defaultFinishFor(r.tcgId, r.language)] as const,
    ),
  );
  return rows.map((r) =>
    r.owned && !r.finish ? { ...r, finish: answers.get(key(r)) ?? "normal" } : r,
  );
}
