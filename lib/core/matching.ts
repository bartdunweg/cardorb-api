/**
 * Whether two names are the same card.
 *
 * Split out of cards.ts, which used to carry this beside artwork resolution
 * and collection assembly with no seam between them. Matching has no opinion
 * about scans or prices and nothing here reads a catalogue, so it is testable
 * — and tested, in cards-name.test.ts — on its own.
 */
import { norm } from "./util";

/**
 * The check exists to catch numbering that does not line up, where a scan would
 * be of a different Pokémon entirely. Straight equality was too blunt for that
 * job: Bart files a card as "Venusaur" where TCGdex calls it "Venusaur ex", and
 * on a set like 151 that alone accounted for most of the missing artwork.
 *
 * The card-type suffix comes off both sides before comparing, rather than
 * falling back to "does one contain the other", which would happily accept
 * Mewtwo's scan for a card filed as Mew.
 */
const TYPE_SUFFIX = /\s+(ex|gx|v|vmax|vstar|v-union|prime|legend|break|lv\.?\s?x|star|δ)$/i;

/**
 * How many single-character edits apart two strings are, giving up at `cap`.
 *
 * Two rows of the usual matrix rather than the whole thing, and an early exit
 * once every cell in a row is over the cap, because the answer this is asked for
 * is never "how far apart" but "closer than two".
 */
function editDistance(a: string, b: string, cap: number): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  // Two rows of the matrix, swapped rather than reallocated. The assertions
  // below are the loop bounds restated: every index here is between 0 and
  // b.length, which is the length both rows were made at, and
  // noUncheckedIndexedAccess cannot see that.
  let prev = new Int32Array(b.length + 1);
  let row = new Int32Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    row[0] = i;
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const cell = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + cost);
      row[j] = cell;
      if (cell < best) best = cell;
    }
    if (best > cap) return cap + 1;
    [prev, row] = [row, prev];
  }
  return prev[b.length]!;
}

/* Exported for lib/cards-name.test.ts, which is a list of the real rows this
   had to be widened for and the pairs it still has to refuse. */
export const sameCard = (a: string, b: string) => {
  const bare = (s: string) => norm(s.replace(TYPE_SUFFIX, ""));
  if (norm(a) === norm(b) || bare(a) === bare(b)) return true;
  /**
   * A misspelling, which is a thing a hand-kept database of two thousand rows
   * has whatever anyone intends. Twenty-two of these were sitting in the
   * collection: Tyrantirar, Mimikiyu, Sigilpyh, Lyanroc, Aegilash, Mabostiff.
   * Every one of them lost its match, and with it its scan, its price, its page
   * and its place in the Pokédex, which is how a Pokémon Bart owns showed as an
   * empty slot.
   *
   * Two edits, and only for a name long enough to survive them: on a short name
   * two edits is most of the word, and Muk and Mew are two apart. That is the
   * line the strict check was drawn at in the first place, and it holds, because
   * the pair this exists to reject is Mew against Mewtwo, which is three.
   *
   * Worth remembering what has already had to be true before this is consulted:
   * the row's number resolved to this card inside the set the row itself names.
   * This is not searching for a name, it is deciding whether a number that
   * already lined up is believable.
   */
  const [x, y] = [bare(a), bare(b)];
  const cap = Math.min(x.length, y.length) >= 6 ? 2 : 1;
  return editDistance(x, y, cap) <= cap;
};
