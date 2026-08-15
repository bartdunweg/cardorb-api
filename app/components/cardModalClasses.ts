// Shared between CardModal.tsx, PublicCardDialog.tsx (.modal--card) and
// CardAddDialog.tsx (.modal--card-add), passed as Modal's className prop.
//
// The literal class names stay: .modal--card .modal-scroll,
// .modal--card .card-detail-body and .modal-close live in cards.css against
// Modal.tsx's own internal markup, which a className prop can't reach.
//
// svh, not vh: on iOS vh is the large viewport, the height with the browser
// bars out of the way, so anything measured in it is taller than what you can
// actually see while they are showing. svh is the smallest it can be, so the
// sheet is drawn once and stays rather than resizing under your thumb as the
// bars come and go.
export const modalCardClassName =
  "modal--card w-[min(920px,calc(100vw-2*var(--space-6)))] max-h-[calc(100svh-2*var(--space-6))] " +
  "rounded-lg p-0 overflow-hidden [box-shadow:var(--shadow-elevated)] " +
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
  "modal--card-add w-[min(560px,calc(100vw-2*var(--space-6)))] max-h-[calc(100svh-2*var(--space-6))] " +
  "rounded-lg p-0 overflow-hidden [box-shadow:var(--shadow-elevated)] " +
  "[@media(max-width:640px)]:w-full [@media(max-width:640px)]:max-h-[92svh] " +
  "[@media(max-width:640px)]:rounded-t-lg [@media(max-width:640px)]:rounded-b-none " +
  "[@media(max-width:640px)]:self-end";
