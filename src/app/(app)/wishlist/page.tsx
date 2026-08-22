import type { Metadata } from "next";
import CollectionScreen from "@/features/collection/components/CollectionScreen";

export const metadata: Metadata = { title: "Wishlist" };

/**
 * What you want rather than what you have.
 *
 * Its own address rather than a filter, because the two answer different
 * questions — one is what you own, the other is what to buy — and mixing
 * thirty-three wanted cards into sixteen hundred held ones left a dimmed scan
 * as the only thing telling them apart.
 */
export default function WishlistPage() {
  return <CollectionScreen scope="wishlist" />;
}
