// Shared between CardModal.tsx, PublicCardDialog.tsx (.modal--card) and
// CardAddDialog.tsx (.modal--card-add), passed as Modal's className prop.
//
// The scroll box is reached with `[&_.modal-scroll]:` rather than from a
// stylesheet. Modal.tsx owns that div and takes no className for it, which is
// why these rules used to be in cards.css — but an arbitrary descendant variant
// reaches it from here, and then the two variants stop being a rule each in a
// file nobody opens.
//
// `.modal--card`, `.modal--card-add` and `.modal--sheet` are literal names with
// no stylesheet behind them any more: cards.css is gone, and they survive only
// as the scope these `[&_…]` variants are written under. Modal.tsx puts them on
// the panel, and src/components/shared/Modal.dom.test.tsx fails if it stops.
//
// svh, not vh: on iOS vh is the large viewport, the height with the browser
// bars out of the way, so anything measured in it is taller than what you can
// actually see while they are showing. svh is the smallest it can be, so the
// sheet is drawn once and stays rather than resizing under your thumb as the
// bars come and go.
export const modalCardClassName =
  "modal--card w-[min(920px,calc(100vw-2*calc(var(--spacing)*6)))] max-h-[calc(100svh-2*calc(var(--spacing)*6))] " +
  "rounded-orb-lg p-0 overflow-hidden shadow-2xl " +
  "[&_.modal-scroll]:overflow-y-auto [&_.modal-scroll]:overscroll-contain " +
  "[&_.modal-scroll]:max-h-[calc(100svh-2*calc(var(--spacing)*6))] " +
  "[&_.modal-scroll]:pt-10 px-[var(--card-pad)] pb-[var(--card-pad)] " +
  // `!`, not because two rules disagree but because nothing guarantees which
  // wins. CardDetail carries `mt-6` on the element and this cancels it from the
  // ancestor; both are utilities, so the order Tailwind emits them decides, and
  // that order is not a documented promise. The cascade-layer rule and the
  // conditional-reset rule are both this exact fact, and the fix was the same `!`.
  "[&_.card-detail-body]:!mt-0 " +
  // Full screen on a phone, not a sheet stopping short of the top. A card is
  // the one thing on this site worth the whole screen: it is a picture with
  // small print on it, and eight percent of the height went to a strip of
  // blurred grid nobody was reading. Corners squared off and the edge-to-edge
  // height taken, so the scan is as large as the device can draw it.
  "[@media(max-width:640px)]:w-full [@media(max-width:640px)]:h-[100svh] " +
  "[@media(max-width:640px)]:max-h-[100svh] [@media(max-width:640px)]:rounded-none " +
  "[@media(max-width:640px)]:border-none [@media(max-width:640px)]:self-stretch";

// Narrower than the card dialog above it: this is a form of short fields, and
// a 920px box would put a 60-character input on a line nobody has to read
// across. The sheet treatment on a phone is the same one .modal--card takes,
// and for the same reason: a dialog opened from a bar at the bottom of the
// screen should arrive from the bottom of the screen.
export const modalCardAddClassName =
  "modal--card-add w-[min(560px,calc(100vw-2*calc(var(--spacing)*6)))] max-h-[calc(100svh-2*calc(var(--spacing)*6))] " +
  "rounded-orb-lg p-0 overflow-hidden shadow-2xl " +
  "[&_.modal-scroll]:overflow-y-auto [&_.modal-scroll]:overscroll-contain " +
  "[&_.modal-scroll]:max-h-[calc(100svh-2*calc(var(--spacing)*6))] " +
  "[&_.modal-scroll]:pt-10 px-[var(--card-pad)] pb-[var(--card-pad)] " +
  "[@media(max-width:640px)]:w-full [@media(max-width:640px)]:max-h-[92svh] " +
  // The scroll box gets the same cap as the sheet around it. Was its own 640px
  // block on `.modal--card-add .modal-scroll` in cards.css, before that file was
  // migrated away; reached through the
  // variant now, like every other rule in this file that has to touch Modal's
  // own markup.
  "[@media(max-width:640px)]:[&_.modal-scroll]:max-h-[92svh] " +
  "[@media(max-width:640px)]:rounded-t-lg [@media(max-width:640px)]:rounded-b-none " +
  "[@media(max-width:640px)]:self-end";
