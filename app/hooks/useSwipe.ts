"use client";

import { useRef, type TouchEvent } from "react";

/**
 * Left and right swipes on a touch screen, as two handlers to spread onto an
 * element.
 *
 * Deliberately small. A pointer-events implementation would also catch a mouse
 * drag, which on a card dialog is how you select the text of an attack rather
 * than how you ask for the next card; touch events are the ones that only fire
 * where the gesture is meant.
 *
 * The thresholds are the usual pair and they matter: 60px of travel so a tap
 * that wobbles is not a swipe, and a horizontal distance at least twice the
 * vertical so scrolling a long card down does not fire one on the way.
 */
export function useSwipe(onLeft: () => void, onRight: () => void) {
  const from = useRef<{ x: number; y: number } | null>(null);

  return {
    onTouchStart: (e: TouchEvent) => {
      const t = e.touches[0];
      from.current = t ? { x: t.clientX, y: t.clientY } : null;
    },
    onTouchEnd: (e: TouchEvent) => {
      const start = from.current;
      const t = e.changedTouches[0];
      from.current = null;
      if (!start || !t) return;
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 2) return;
      // Swiping left moves forward, the way a stack of cards is dealt through.
      if (dx < 0) onLeft();
      else onRight();
    },
  };
}
