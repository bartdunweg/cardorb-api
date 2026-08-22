import { redirect } from "next/navigation";

/**
 * Where the collection used to live.
 *
 * This address was the whole app for two years — it is in bookmarks, in the
 * iOS client's memory, and in whatever links have been shared of it — so it
 * keeps answering. It just answers by pointing at the collection's real
 * address now.
 *
 * A redirect rather than a second copy of the screen. While both existed, the
 * signed-in shell was rendered two ways: once by the (app) layout and once by
 * CardsView's own chrome, with the same rail and bar written twice and free to
 * disagree. Removing this one leaves CardsView's chrome doing exactly one job —
 * the public page — which is what makes it possible to delete every owner-only
 * branch inside it.
 *
 * /cards/[id] is untouched. A card still has that address, the intercepted
 * modal still catches it, and neither depends on this page existing.
 */
export default function CardsPage() {
  redirect("/collection");
}
