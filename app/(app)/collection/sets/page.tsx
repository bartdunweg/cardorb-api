import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentViewer } from "../../../../lib/api/viewer";
import { getCards } from "../../../../lib/core/collection";
import SetIndex from "../../../components/SetIndex";

/**
 * The set index.
 *
 * A screen rather than the rail's list, and the difference is an address: this
 * can be linked, it survives a refresh, and it is reachable at every width —
 * where the rail is hidden below 1000px.
 *
 * It reads the collection here rather than from the shell's context because it
 * needs the totals and the logos, which the grid does not carry. getCards() is
 * cache()d per request and the layout has already called it, so this is a map
 * lookup rather than a second walk.
 */
export const metadata: Metadata = { title: "Sets" };

export default async function SetsPage() {
  const viewer = await currentViewer();
  if (!viewer) redirect("/login?next=/collection/sets");

  return <SetIndex sets={await getCards(viewer.userId)} />;
}
