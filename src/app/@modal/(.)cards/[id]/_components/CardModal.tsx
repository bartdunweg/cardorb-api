"use client";
import { useCallback, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/shared/Modal";
import { modalCardClassName } from "@/features/collection/components/cardModalClasses";

/**
 * The dialog the card detail is shown in when it is opened from the list.
 *
 * Closing is a history step back, not a link to /cards: back is what actually
 * restores the list, with its filters, its sort and its scroll position still
 * in place. That is the whole reason this route is intercepted. A link would
 * mount CardsView again and lose all twelve pieces of its state.
 */
export default function CardModal({ label, children }: { label: string; children: ReactNode }) {
  const router = useRouter();
  const close = useCallback(() => router.back(), [router]);

  return (
    <Modal open onClose={close} label={label} className={modalCardClassName}>
      {children}
    </Modal>
  );
}
