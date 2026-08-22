import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentViewer } from "@/lib/api/viewer";
import { getCards } from "@/lib/core/collection";
import { bySlug } from "@/lib/core/slug";
import CollectionScreen from "@/components/shared/CollectionScreen";

/**
 * One set.
 *
 * The slug is resolved on the server so a name nobody owns is a 404 rather than
 * an empty grid that looks like a set which failed to load. getCards() is
 * cache()d per request and the layout has already called it, so this costs a
 * map lookup rather than a second walk — and the page still ships only the
 * name, because the cards come out of the shell's context.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const viewer = await currentViewer();
  if (!viewer) return {};
  const set = bySlug(await getCards(viewer.userId), slug);
  // The catalogue's name where there is one, the owner's where there is not.
  return { title: set?.title ?? "Set" };
}

export default async function SetPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const viewer = await currentViewer();
  if (!viewer) redirect(`/login?next=/collection/set/${slug}`);

  const set = bySlug(await getCards(viewer.userId), slug);
  if (!set) notFound();

  return <CollectionScreen scope={set.name} />;
}
