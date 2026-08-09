"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";

export type PillBox = { x: number; y: number; w: number; h: number; ready: boolean };

/**
 * Measures the selected item inside a track and hands back the box a shared
 * pill should occupy, so the selection slides between items instead of being
 * painted separately on each one.
 *
 * Lifted out of TabBar, which had it inline, once the favourites shelves wanted
 * the same control. Every awkward detail in here was found there and is worth
 * keeping in one copy:
 *
 * - Nothing selected returns ready: false rather than the last box it had.
 *   A pill left sitting over an item that no longer counts is, in dark mode, a
 *   white pill under a white label: the control appears to lose its text.
 * - Sliding is off until the first placement lands, so the pill snaps onto the
 *   selection on load instead of animating in from the corner.
 * - offsetLeft/offsetTop, not getBoundingClientRect: these are relative to the
 *   track, which is what the pill is positioned against, so a scrolled or
 *   transformed page needs no correction.
 * - Fonts load with display: swap, so a label can change width without the
 *   track resizing and without the ResizeObserver firing. document.fonts.ready
 *   is the second measurement, or the pill keeps the fallback font's width.
 *
 * `activeSelector` matches the selected item within the track; `deps` is
 * whatever changes the selection (a pathname, a piece of state).
 */
export function useSlidingPill<T extends HTMLElement>(
  trackRef: RefObject<T | null>,
  activeSelector: string,
  deps: unknown[],
) {
  const [pill, setPill] = useState<PillBox>({ x: 0, y: 0, w: 0, h: 0, ready: false });
  const [animate, setAnimate] = useState(false);
  const placedOnce = useRef(false);

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const update = () => {
      const el = track.querySelector<HTMLElement>(activeSelector);
      // A zero box is a track that is not on screen, not a placement. /cards
      // hides its bar above 1000px, so the first measurement there is 0x0, and
      // taking it would set placedOnce and turn sliding on: resizing down past
      // the breakpoint then slid the pill in from the corner, which is the
      // exact thing the note above says this hook exists to prevent.
      if (!el || !el.offsetWidth) {
        setPill((p) => (p.ready ? { ...p, ready: false } : p));
        return;
      }
      setPill({
        x: el.offsetLeft,
        y: el.offsetTop,
        w: el.offsetWidth,
        h: el.offsetHeight,
        ready: true,
      });
      if (!placedOnce.current) {
        placedOnce.current = true;
        requestAnimationFrame(() => setAnimate(true));
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(track);
    let cancelled = false;
    document.fonts?.ready.then(() => {
      if (!cancelled) update();
    });
    return () => {
      cancelled = true;
      ro.disconnect();
    };
    // activeSelector and trackRef are stable for the life of a track; the
    // caller's deps are what actually move the pill.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return {
    pill,
    animate,
    /** Ready-made for the pill element: class suffix plus the box it occupies. */
    style: {
      transform: `translate(${pill.x}px, ${pill.y}px)`,
      width: pill.w,
      height: pill.h,
    },
  };
}
