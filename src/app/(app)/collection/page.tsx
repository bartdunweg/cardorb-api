import type { Metadata } from "next";
import CollectionScreen from "@/features/collection/components/CollectionScreen";

export const metadata: Metadata = { title: "Collection" };

/**
 * Everything held, which is what "the collection" means here.
 *
 * ?add=1 opens the add dialog on arrival. It is a query parameter rather than a
 * route because the dialog is state inside CardsView, and it exists so the
 * welcome flow's "Add my first card" lands on the dialog instead of on the
 * screen behind it, with the person left to find the plus themselves. Read here
 * rather than with useSearchParams in the client component: that hook makes its
 * whole subtree opt out of static rendering, and this passes a boolean instead.
 */
export default async function CollectionPage({
  searchParams,
}: {
  searchParams: Promise<{ add?: string }>;
}) {
  const { add } = await searchParams;
  return <CollectionScreen scope="all" openAdd={add === "1"} />;
}
