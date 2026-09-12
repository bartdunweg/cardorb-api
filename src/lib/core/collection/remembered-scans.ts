/**
 * What the rows should remember of the pictures the catalogue just gave.
 *
 * The picture of a card is a catalogue fact and is worked out on every read, from the set
 * catalogue, which is right: a better scan, a corrected match or a card filed under another set
 * is then picked up the same day. What it is not is durable. The answer is cached for a day, so
 * one flaky answer stands for a day, and on 2026-09-12 that emptied every tile of set 151, for
 * the web app, the iOS app and the public profile at once, while the scans themselves were there
 * the whole time.
 *
 * So the row keeps the last answer. Not as a second source of truth: the catalogue wins whenever
 * it answers (buildCollection reaches for the memory only where it answered nothing), and this
 * never records an absence. A picture that has been seen once cannot be lost again.
 */
import type { CardSet } from "./cards";
import type { CollectionRow } from "./collection-row";

/** One picture and the rows that should be holding it. */
export type ScanMemory = { image: string; imageHigh: string | null; ids: string[] };

/**
 * The writes that would bring the rows up to date with what was just resolved, grouped by
 * picture: four copies of one card are one write, and a collection where nothing moved is no
 * write at all, which is the usual answer.
 *
 * Only cards the catalogue answered for. A card it said nothing about is skipped rather than
 * written as null: that is the whole point, an outage must not be able to erase what a row
 * already knows.
 */
export function rememberedScans(rows: CollectionRow[], sets: CardSet[]): ScanMemory[] {
  const stored = new Map(rows.flatMap((r) => (r.id ? [[r.id, r] as const] : [])));
  const byPicture = new Map<string, ScanMemory>();
  for (const set of sets) {
    for (const card of set.cards) {
      if (!card.image) continue;
      const imageHigh = card.imageHigh ?? null;
      for (const variant of card.variants) {
        const row = variant.id ? stored.get(variant.id) : undefined;
        if (!row?.id) continue;
        if ((row.imageUrl ?? null) === card.image && (row.imageHighUrl ?? null) === imageHigh) {
          continue;
        }
        // Keyed on both halves, so a card whose high scan appeared later is its own write
        // rather than being folded in with the rows that already carry the pair.
        const key = `${card.image} ${imageHigh ?? ""}`;
        const found = byPicture.get(key);
        if (found) found.ids.push(row.id);
        else byPicture.set(key, { image: card.image, imageHigh, ids: [row.id] });
      }
    }
  }
  return [...byPicture.values()];
}
