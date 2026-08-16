import type { Metadata } from "next";
import { currentViewer } from "../../../../lib/api/viewer";
import { getRows } from "../../../../lib/core/collection";
import { listSets } from "../../../../lib/core/ptcg-browse";
import { ownershipIndex, setCounts } from "../../../../lib/core/ownership";
import BrowseSetIndex from "../../../components/BrowseSetIndex";

/**
 * The catalogue, as a place.
 *
 * /collection/sets shows the sets this collection has a card in; this shows the
 * other 120-odd. It is the screen half of what the iOS app asked for — the API
 * is /api/v1/catalog/sets — and both read the same two functions, so the shelf
 * and the endpoint cannot disagree about what exists.
 *
 * Rows rather than the assembled collection, deliberately: the shell above has
 * already built the collection for the rail, and this page needs none of it —
 * only which sets have how many rows, which is a Map away from getRows(). See
 * that function's comment and ADR-0014.
 */
export const metadata: Metadata = { title: "Browse sets" };

export default async function BrowsePage() {
  /* The layout redirects a signed-out visitor before this renders; this is here
     because the page reads the viewer's own rows and a userId guessed from a
     null viewer would be a much worse bug than a redundant check. */
  const viewer = await currentViewer();
  if (!viewer) return null;

  const [sets, { rows }] = await Promise.all([listSets(), getRows(viewer.userId)]);
  const index = ownershipIndex(rows);

  return <BrowseSetIndex sets={sets.map((set) => ({ ...set, ...setCounts(index, set) }))} />;
}
