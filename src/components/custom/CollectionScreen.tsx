"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCollection } from "@/app/(app)/CollectionContext";
import CardsView from "@/components/custom/CardsView";

/**
 * The collection, at whatever address you reached it by.
 *
 * A thin thing on purpose. It reads the sets out of the shell rather than being
 * handed them, so a set page ships a slug instead of a megabyte, and it hands
 * CardsView the scope the URL named. Everything below — the toolbar, the
 * filters, the incremental render, the two hundred scans that answer 404 — is
 * the code that was already there, drawn without its furniture because the
 * layout owns that now.
 */
export default function CollectionScreen({
  scope,
  /** Open the add dialog on arrival — /collection?add=1, which is where the
   *  welcome flow's "Add my first card" sends you. */
  openAdd,
}: {
  scope: string;
  openAdd?: boolean;
}) {
  const { sets, onAdd, failed } = useCollection();
  const router = useRouter();

  /**
   * The dialog belongs to the shell (AppShell.tsx owns it, because every screen
   * can open it), so arriving with ?add=1 asks for it rather than rendering one
   * here.
   *
   * The parameter is dropped straight afterwards, with replace so it leaves no
   * history entry: closing the dialog and reloading, or coming back to this
   * screen, would otherwise open it again, and a dialog that will not stay shut
   * reads as a bug rather than as an old URL.
   */
  useEffect(() => {
    if (!openAdd) return;
    onAdd();
    router.replace("/collection");
  }, [openAdd, onAdd, router]);

  // /collection/card, not /cards: a card opened from here should stay inside
  // the (app) shell — sidebar, navbar and all — rather than landing on the
  // older, separate /cards/[id] page outside it.
  return (
    <CardsView
      sets={sets}
      variant="owner"
      scope={scope}
      basePath="/collection/card"
      emptyReason={failed ? "outage" : "nothing-yet"}
      onAdd={onAdd}
    />
  );
}
