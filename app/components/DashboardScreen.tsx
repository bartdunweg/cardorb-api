"use client";

import { useMemo } from "react";
import { getCardsStats } from "../../lib/core/cards-stats";
import type { ValueSnapshot } from "../../lib/core/value-snapshot";
import { useCollection } from "../(app)/CollectionContext";
import CardsDashboard from "./CardsDashboard";

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
export default function DashboardScreen({ snapshots }: { snapshots: ValueSnapshot[] }) {
  const { sets } = useCollection();
  const stats = useMemo(() => getCardsStats(sets), [sets]);
  return <CardsDashboard stats={stats} snapshots={snapshots} />;
}
