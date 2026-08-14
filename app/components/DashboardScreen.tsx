"use client";

import { useMemo } from "react";
import { getCardsStats } from "../../lib/core/cards-stats";
import { useCollection } from "../(app)/CollectionContext";
import CardsDashboard from "./CardsDashboard";

/**
 * The dashboard's client half: it reads the collection out of the shell rather
 * than being handed a second copy of it.
 *
 * The stats are computed here rather than on the server for the same reason
 * they always were — they are derived from the collection the client already
 * holds, so sending them too would be sending the same facts twice.
 */
export default function DashboardScreen() {
  const { sets } = useCollection();
  const stats = useMemo(() => getCardsStats(sets), [sets]);
  return <CardsDashboard stats={stats} />;
}
