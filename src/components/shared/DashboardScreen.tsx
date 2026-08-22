"use client";

import { useMemo } from "react";
import { getCardsStats } from "@/lib/core/cards-stats";
import type { ValueSnapshot } from "@/lib/core/value-snapshot";
import { moversOf, type CardPricePoint } from "@/lib/core/movers";
import { useCollection } from "@/app/(app)/CollectionContext";
import CardsDashboard from "@/components/shared/CardsDashboard";
import Card from "@/components/shared/Card";
import { EmptyState } from "@/components/application/empty-state/empty-state";
import { Inbox01 } from "@untitledui-pro/icons/line";
import { cardsMainTitleClassName } from "@/components/shared/cardsPageClasses";

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
  const { sets, failed, onAdd } = useCollection();
  const stats = useMemo(() => getCardsStats(sets), [sets]);
  // Here rather than on the server for the same reason the stats are: it is a
  // pure function of the collection this client already holds plus a few
  // hundred price rows, and computing it there would mean sending the answer
  // as well as the inputs.
  const movers = useMemo(() => moversOf(sets, prices), [sets, prices]);

  /**
   * A failed read is not an empty collection, and this screen used to say it was.
   *
   * `failed` was sitting in the context unread. When the collection could not be
   * loaded, `sets` is `[]` — so `getCardsStats([])` returns zeroes and the
   * dashboard drew "In the binder 0 · Wishlist 0 · Sets 0 · €0" as settled fact,
   * with every card below it rendering nothing. Telling somebody they own no
   * cards because a database call failed is the misleading kind of wrong: the
   * numbers look authoritative and there is nothing on screen to doubt.
   *
   * The same sentence CardsView shows for the same condition, deliberately —
   * one outage, one wording. CardsView reaches it through
   * `emptyReason={failed ? "outage" : "nothing-yet"}` in CollectionScreen; this
   * is that branch, for the screen that had no branch at all.
   *
   * The heading stays. It is the only place "Dashboard" is written on the page
   * (the shell's own h1 is sr-only), so dropping it would leave the route
   * nameless exactly when something has already gone wrong.
   */
  if (failed) {
    return (
      <div className="flex flex-col gap-8">
        <h1 className={cardsMainTitleClassName}>Dashboard</h1>
        <Card>
          <EmptyState size="md" className="gap-2 py-4">
            <EmptyState.Header>
              <EmptyState.FeaturedIcon color="gray" icon={Inbox01} />
            </EmptyState.Header>
            <EmptyState.Description>
              The collection is not available right now. It should be back shortly.
            </EmptyState.Description>
          </EmptyState>
        </Card>
      </div>
    );
  }

  // onAdd only on the good branch. The failed one above keeps its bare heading
  // deliberately: if the collection could not be read, offering to add to it is
  // an action pointing at the thing that just broke.
  return <CardsDashboard stats={stats} snapshots={snapshots} movers={movers} onAdd={onAdd} />;
}
