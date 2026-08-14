import type { Metadata } from "next";
import CollectionScreen from "../../components/CollectionScreen";

export const metadata: Metadata = { title: "Collection" };

/** Everything held, which is what "the collection" means here. */
export default function CollectionPage() {
  return <CollectionScreen scope="all" />;
}
