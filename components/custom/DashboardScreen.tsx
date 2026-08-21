"use client";

import { useMemo } from "react";
import { getCardsStats } from "@/lib/core/cards-stats";
import type { ValueSnapshot } from "@/lib/core/value-snapshot";
import { moversOf, type CardPricePoint } from "@/lib/core/movers";
import { useCollection } from "@/app/(app)/CollectionContext";
import CardsDashboard from "@/components/custom/CardsDashboard";

/**
 * The dashboard's client half: it reads the collection out of the shell rather
 * than being handed a second copy of it.
 *
 * The stats are computed here rather than on the server for the same reason
 * they always were — they are derived from the collection the client already
 * holds, so sending them too would be sending the same facts twice.
 *
 * `snapshots` is the exception, and it is the exception for the opposite
 * reason: the value history is not derived from the collection and the client
 * does not hold it. It is a separate table, read per person by the server page
 * above, and there is nothing here it could be recomputed from.
 */
export default function DashboardScreen({
  snapshots,
  prices,
}: {
  snapshots: ValueSnapshot[];
  prices: CardPricePoint[];
}) {
  const { sets } = useCollection();
  const stats = useMemo(() => getCardsStats(sets), [sets]);
  // Here rather than on the server for the same reason the stats are: it is a
  // pure function of the collection this client already holds plus a few
  // hundred price rows, and computing it there would mean sending the answer
  // as well as the inputs.
  const movers = useMemo(() => moversOf(sets, prices), [sets, prices]);
  return <CardsDashboard stats={stats} snapshots={snapshots} movers={movers} />;
}
