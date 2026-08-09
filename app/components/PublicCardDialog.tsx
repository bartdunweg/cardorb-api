"use client";

import { useEffect, useState } from "react";
import Modal from "./Modal";
import CardDetail from "./CardDetail";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useSwipe } from "../hooks/useSwipe";
import type { CardDetail as Detail, OwnedCard } from "../../lib/core/cards";

/**
 * A card on the public link, opened in place.
 *
 * The signed-in side opens a card by navigating to /cards/<id>, which an
 * intercepted route catches and draws as a dialog. That cannot work here: the
 * middleware in front of /cards sends anyone without a session to the login, so
 * on the public page a tap on a scan bounced the visitor out of the collection
 * they had been given a link to.
 *
 * So no navigation. The card has no URL of its own here, and that is a fair
 * trade for a page whose whole job is to be looked at rather than linked into.
 * It also saves a second interception and a second prerender over sixteen
 * hundred ids.
 *
 * The detail is fetched rather than passed down: /user/<name> already ships a
 * megabyte of collection, and the illustrator, HP and stage of every card in it
 * would be several more for the one card anybody opens.
 */
export default function PublicCardDialog({
  username,
  card,
  setName,
  onClose,
  onGo,
  hasPrev,
  hasNext,
}: {
  username: string;
  /** Move to the card either side of this one, in the order on screen. */
  onGo?: (dir: -1 | 1) => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  /** The row from the collection, which the detail is drawn against. */
  card: OwnedCard | null;
  setName: string | null;
  onClose: () => void;
}) {
  const swipe = useSwipe(
    () => onGo?.(1),
    () => onGo?.(-1),
  );
  const [detail, setDetail] = useState<Detail | null>(null);
  const [failed, setFailed] = useState(false);
  const id = card?.tcgId ?? null;

  // Keyed on the id rather than reset inside the effect: clearing the previous
  // card's detail with setState at the top of an effect is a second render
  // before the fetch even starts, and React says so. Holding the id the state
  // belongs to means a new card simply has no detail yet.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const showing = loadedFor === id ? detail : null;

  useEffect(() => {
    if (!id) return;
    let live = true;
    fetch(`/api/v1/public/${encodeURIComponent(username)}/cards/${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Detail) => {
        if (!live) return;
        setDetail(d);
        setLoadedFor(id);
        setFailed(false);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [id, username]);

  return (
    <Modal
      open={card != null}
      onClose={onClose}
      label={card?.name ?? "Card"}
      className="modal--card"
    >
      <div {...swipe}>
      {showing && card ? (
        <CardDetail
          card={showing}
          mine={{ card, setName: setName ?? "" }}
          nav={
            onGo && (hasPrev || hasNext) ? (
              // Buttons, not links: on the public page a card has no URL of its
              // own, so there is nothing for an anchor to point at. Swiping the
              // dialog does the same thing.
              <>
                <button
                  type="button"
                  className="btn btn--icon"
                  onClick={() => onGo(-1)}
                  disabled={!hasPrev}
                  aria-label="Previous card"
                >
                  <ChevronLeft size={20} strokeWidth={1.75} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="btn btn--icon"
                  onClick={() => onGo(1)}
                  disabled={!hasNext}
                  aria-label="Next card"
                >
                  <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" />
                </button>
              </>
            ) : undefined
          }
        />
      ) : (
        // The scan is already in the browser's cache from the grid, so it draws
        // at once and the rest fills in under it. Showing it beats a spinner in
        // an empty box: what you tapped is what you see.
        <div className="card-detail-pending">
          {card?.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card.image} alt={card.name} className="card-detail-pending-scan" />
          )}
          <p className="card-detail-pending-name">{card?.name}</p>
          {failed && <p className="cards-profile-error">That card would not load. Try again.</p>}
        </div>
      )}
      </div>
    </Modal>
  );
}
