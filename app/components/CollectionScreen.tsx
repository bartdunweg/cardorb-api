"use client";

import { useCollection } from "../(app)/CollectionContext";
import CardsView from "./CardsView";

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
export default function CollectionScreen({ scope }: { scope: string }) {
  const { sets } = useCollection();
  return <CardsView sets={sets} variant="owner" scope={scope} />;
}
