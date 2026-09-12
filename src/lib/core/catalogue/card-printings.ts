import { EDITIONS, FINISHES } from "../collection/collection-row";
import type { Edition, Finish, FoilPattern } from "../collection/collection-row";
import TCGPLAYER_IDS from "../tcgplayer-ids.generated.json";

/**
 * Which printings of a card exist, and which print runs, from what TCGdex says per card.
 *
 * The apps have had the rule for a while: a form offers no finish and no foil that is not in
 * this list, and offers everything where the list is empty, because empty is the catalogue
 * having no answer rather than none existing. What they did not have is the list. The card route
 * answered `firstEdition` and nothing else, so every client took the "no answer" branch on every
 * card, and Pikachu with Grey Felt Hat — a promo TCGdex knows as a plain normal — offered a
 * holo, a reverse holo, a Poké Ball reverse and a Master Ball reverse.
 *
 * `variants_detailed` is where the answer is: one entry per printing, each with a `type`
 * (normal, holo, reverse) and, where the foil has a name, a `foil`. The Poké Ball and Master
 * Ball prints are reverses whose foil TCGdex names, which settles a question this code used to
 * leave open: they were offered on every card with any reverse because nothing was thought to
 * say which cards got one.
 */

/** One printing of a card: what it is, and what its foil looks like where that has a name. */
export type Printing = { finish: Finish; foilPattern: FoilPattern | null };

/** TCGdex' `type` on a variant, in this app's words. Anything else is a printing we do not model. */
const FINISH_OF: Record<string, Finish> = {
  normal: "normal",
  holo: "holo",
  reverse: "reverse-holo",
};

/**
 * TCGdex' `foil` on a variant, in this app's words.
 *
 * The two ball prints land in `finish`, not in `foilPattern`: Cardmarket prices them apart, and
 * FINISHES is the column that picks a price series (see collection-row.ts). A foil this app has
 * no word for — `league` is one — leaves the printing in its plain finish with no pattern, which
 * is true: the printing exists, and what its foil is called is not something we can record.
 */
const PATTERN_OF: Record<string, FoilPattern> = { cosmos: "cosmos" };
const BALL_OF: Record<string, Finish> = { pokeball: "poke-ball", masterball: "master-ball" };

export type TcgVariant = { type?: string; foil?: string; stamp?: string[] };

/**
 * The printings a card has, deduped, in FINISHES order.
 *
 * A stamped variant (`stamp: ["gamestop"]`) is not a printing of its own here: it is the same
 * finish with a shop's mark on it, and this app does not record the mark. Dropping the stamp
 * rather than the variant keeps the finish it proves.
 */
export function printingsOf(variants: TcgVariant[] | null | undefined): Printing[] {
  const seen = new Map<string, Printing>();
  for (const v of variants ?? []) {
    const base = FINISH_OF[v.type ?? ""];
    if (!base) continue;
    const foil = (v.foil ?? "").toLowerCase();
    const ball = BALL_OF[foil];
    const finish = ball && base === "reverse-holo" ? ball : base;
    const foilPattern = ball ? null : (PATTERN_OF[foil] ?? null);
    seen.set(`${finish}|${foilPattern ?? ""}`, { finish, foilPattern });
  }
  return [...seen.values()].sort(
    (a, b) =>
      FINISHES.indexOf(a.finish) - FINISHES.indexOf(b.finish) ||
      (a.foilPattern ?? "").localeCompare(b.foilPattern ?? ""),
  );
}

/**
 * The cards TCGplayer prices a Shadowless run for, as tcgplayer-links.mjs linked them: 101 of
 * Base Set's 102. It was Cardmarket's list until 2026-09-12, which filed every Base Set card as
 * having one, Machamp included, for which TCGplayer has no Shadowless product.
 * A run is offered where the market the app prices from has a figure for it.
 */
const SHADOWLESS = new Set(
  Object.entries(TCGPLAYER_IDS as Record<string, { shadowless?: unknown } | null>).flatMap(
    ([id, v]) => (v?.shadowless ? [id] : []),
  ),
);

/**
 * The print runs a copy of this card can be from, or null where nothing can say.
 *
 * `firstEdition` is TCGdex'; Shadowless is Base Set's middle run, which no catalogue records as
 * a variant but Cardmarket does price as a product of its own, and the map of those products is
 * in this repo. So the third run is a fact now rather than a choice offered everywhere: a Jungle
 * card has a 1st Edition and an unlimited run and no Shadowless one, and used to be offered all
 * three.
 *
 * Null where TCGdex did not say whether a stamped run exists, which is the rule the printings
 * follow: no answer is not "none exist", and a client offers every run then.
 */
export function editionsOf(
  tcgId: string,
  firstEdition: boolean | null | undefined,
): Edition[] | null {
  if (firstEdition == null) return null;
  const runs: Edition[] = ["unlimited"];
  if (firstEdition) runs.push("1st-edition");
  if (SHADOWLESS.has(tcgId)) runs.push("shadowless");
  return EDITIONS.filter((e) => runs.includes(e));
}
