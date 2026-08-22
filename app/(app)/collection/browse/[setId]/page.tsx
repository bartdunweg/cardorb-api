import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentViewer } from "@/lib/api/viewer";
import { getRows } from "@/lib/core/collection";
import { findSet, setCards } from "@/lib/core/ptcg-browse";
import { withTcgdexScans } from "@/lib/core/browse-artwork";
import { markOwnership, ownershipIndex } from "@/lib/core/ownership";
import BrowseSetGrid from "@/components/shared/BrowseSetGrid";

/**
 * One set, all of it.
 *
 * Addressed by the catalogue's own set id ("sv3pt5") rather than by a slug of
 * its name, unlike /collection/set/[slug] next door. That route is addressed by
 * a name because the thing it opens is a group of *your* rows, and the only id
 * they share is the name you filed them under. Here the thing being opened is
 * the catalogue's set, which has an id, and using it means the URL cannot be
 * ambiguous between "151" the set and "151" the number.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ setId: string }>;
}): Promise<Metadata> {
  const { setId } = await params;
  /* listSets() underneath, cached for a day and already fetched by the page
     itself — so this is a second lookup in the same cached list rather than a
     second request. A set the catalogue does not list gets the generic title
     and then a 404 from the page. */
  const set = await findSet(setId).catch(() => null);
  return { title: set ? `${set.name} · Browse` : "Browse" };
}

export default async function BrowseSetPage({ params }: { params: Promise<{ setId: string }> }) {
  const viewer = await currentViewer();
  if (!viewer) return null;

  const { setId } = await params;
  const set = await findSet(setId);
  /* An id nobody carries is a 404 rather than an empty grid — the same call the
     API route makes, for the same reason: a set that does not exist and a set
     with no cards in it are different answers. A catalogue that refused throws
     instead, and error.tsx below says so. */
  if (!set) notFound();

  /* withTcgdexScans() swaps pokemontcg.io's 198 kB PNGs for TCGdex's 26 kB
     WebP wherever TCGdex has the same card — one extra cached request for
     roughly seven eighths of this page's weight. See browse-artwork.ts. */
  const [cards, { rows }] = await Promise.all([
    setCards(setId).then((found) => withTcgdexScans(set, found)),
    getRows(viewer.userId),
  ]);

  return <BrowseSetGrid set={set} cards={markOwnership(ownershipIndex(rows), cards)} />;
}
