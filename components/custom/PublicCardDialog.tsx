"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/custom/Modal";
import CardDetail from "@/components/custom/CardDetail";
import { FormError } from "@/components/custom/FormField";
import { ChevronLeft, ChevronRight } from "@untitledui/icons";
import { useSwipe } from "@/app/hooks/useSwipe";
import type { CardDetail as Detail, OwnedCard } from "@/lib/core/cards";
import { modalCardClassName } from "@/components/custom/cardModalClasses";
import { untitledIconButton } from "@/components/custom/untitledButtonClasses";

/**
 * A card on the public link, opened in place.
 *
 * The signed-in side opens a card by navigating to /cards/<id>, which an
 * intercepted route catches and draws as a dialog. That cannot work here: the
 * proxy in front of /cards sends anyone without a session to the login, so
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
  /**
   * What the grid already knows, shaped as a detail.
   *
   * The dialog used to open on the scan alone and swap to the real thing when
   * the fetch landed, which read as the card arriving in two pieces. Most of
   * what the page shows is already in the browser: the name, the set, the
   * number, the type and the printing all came down with the collection. Only
   * HP, stage, illustrator and the regulation mark need asking for.
   *
   * So the dialog opens complete and fills in the last four rows rather than
   * appearing twice. Nothing here is invented: a field this cannot know is
   * null, and CardDetail draws no row for a fact with no answer.
   */
  const known: Detail | null = card
    ? {
        id: card.tcgId ?? "",
        name: card.name,
        image: card.image,
        rarity: card.variants[0]?.rarity ?? null,
        illustrator: null,
        hp: null,
        types: card.type ? [card.type] : [],
        stage: null,
        evolveFrom: null,
        regulationMark: null,
        set: setName ? { id: "", name: setName, logo: null, total: null } : null,
        cmId: null,
        cmUrl: "",
        price: null,
        market: null,
      }
    : null;

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
      className={modalCardClassName}
    >
      <div {...swipe}>
        {card ? (
          <CardDetail
            card={showing ?? known!}
            mine={{ card, setName: setName ?? "" }}
            nav={
              onGo && (hasPrev || hasNext) ? (
                // Buttons, not links: on the public page a card has no URL of its
                // own, so there is nothing for an anchor to point at. Swiping the
                // dialog does the same thing.
                <>
                  <button
                    type="button"
                    className={untitledIconButton({ color: "secondary" })}
                    onClick={() => onGo(-1)}
                    disabled={!hasPrev}
                    aria-label="Previous card"
                  >
                    <ChevronLeft size={20} strokeWidth={1.75} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={untitledIconButton({ color: "secondary" })}
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
        ) : null}
        {failed && <FormError>That card would not load. Try again.</FormError>}
      </div>
    </Modal>
  );
}
