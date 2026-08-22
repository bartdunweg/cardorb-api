import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { currentViewer } from "@/lib/api/viewer";
import { getCards } from "@/lib/core/collection/collection";
import { groupByEra } from "@/lib/core/catalogue/eras";
import { slugify } from "@/lib/core/slug";

import CollectionScreen from "@/features/collection/components/CollectionScreen";

/**
 * One era: every set from a stretch of years, together.
 *
 * Resolved through the same grouping the rail draws, so an era exists here
 * exactly when it exists there. Computing it a second way would let the two
 * disagree about which sets belong to it — see lib/core/catalogue/eras.ts.
 */
async function eraFor(slug: string) {
  const viewer = await currentViewer();
  if (!viewer) return null;
  const sets = await getCards(viewer.userId);
  const held = sets.filter((set) => set.cards.some((card) => card.owned));
  return groupByEra(held).find((group) => slugify(group.era) === slug) ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return { title: (await eraFor(slug))?.era ?? "Era" };
}

export default async function EraPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const viewer = await currentViewer();
  if (!viewer) redirect(`/login?next=/collection/era/${slug}`);

  const era = await eraFor(slug);
  if (!era) notFound();

  // The prefix CardsView has always used for an era. It stays its vocabulary;
  // the URL is translated into it here rather than teaching it about routes.
  return <CollectionScreen scope={`era:${era.era}`} />;
}
