import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentViewer } from "@/lib/api/viewer";
import { getCardPrices, getCollection, getValueHistory } from "@/lib/core/collection";
import DashboardScreen from "@/components/shared/DashboardScreen";

/**
 * Where you land, signed in.
 *
 * Landing here was tried once and rolled back, and the reason was written down
 * rather than forgotten: "you arrived at four numbers and a chart and pressed
 * once more to reach what you came for." That objection is correct about a
 * dashboard that is only a summary, and it is answered by what the screen is
 * rather than by moving it — see DashboardScreen, where the doing comes first
 * and the counting is the footer.
 *
 * Two things also changed underneath it. An account can now be new, and landing
 * a new account on an empty grid is landing it on nothing. And there are things
 * to do — import, share — that had no home at all.
 */
export const metadata: Metadata = { title: "Dashboard" };

/**
 * The value history is fetched here rather than in the (app) layout beside the
 * collection, and that is the difference between the two: seven screens share
 * that layout and exactly one of them draws this. Fetching it up there would
 * cost every screen a query for a chart only this page has.
 *
 * currentViewer() is cache()d, so asking again after the layout already asked
 * is one query in one render, not two. The redirect is narrowing rather than a
 * second lock — the layout has already turned a signed-out visitor away.
 */
export default async function DashboardPage() {
  const viewer = await currentViewer();
  if (!viewer) redirect("/login?next=/dashboard");

  // getCollection() is cache()d and the (app) layout already called it this
  // render, so this costs nothing: it is here only to know which cards to ask
  // for prices about.
  const { sets } = await getCollection(viewer.userId);
  const tcgIds = [
    ...new Set(sets.flatMap((s) => s.cards.map((c) => c.tcgId)).filter(Boolean)),
  ] as string[];

  const [snapshots, prices] = await Promise.all([
    getValueHistory(viewer.userId),
    getCardPrices(viewer.userId, tcgIds),
  ]);
  return <DashboardScreen snapshots={snapshots} prices={prices} />;
}
