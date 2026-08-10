"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

/**
 * The scan you can tilt, on the one screen where there is a single card.
 *
 * The grid has this already, and there it is rationed: a card is upgraded when
 * it is first pointed at, because every instance is a custom element with a
 * shadow root and `will-change` on two layers, and a browser will not grant
 * sixteen hundred compositor layers. See CardItem for that argument.
 *
 * None of it applies here. There is one card on this screen and it is the
 * subject of it — the reason you opened it is to look at the artwork. So the
 * effect is armed on mount rather than on hover: waiting for a pointer would
 * mean the picture you came to see only becomes the real thing once you happen
 * to touch it, and on a phone there is no hover to wait for at all.
 *
 * Server-rendered bare and upgraded after mount, which is one remount. That is
 * deliberate and cheap: CardDetail is a server component and this is the only
 * client boundary it needs, the custom element cannot be defined during SSR
 * anyway, and by then the scan is in the browser's cache and paints in the same
 * frame.
 */
export default function TiltScan({
  /** The small scan, for the foil mask. Null where there is none to key off. */
  scan,
  /** The printing, which is what decides which foil the stylesheet draws. */
  rarity,
  children,
}: {
  scan: string | null;
  rarity: string | null;
  children: ReactNode;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    let live = true;
    // Imported here rather than at the top of the file: the module calls
    // customElements.define on evaluation, and a client component is still
    // evaluated on the server. Repeat calls are the module cache, so this is
    // free once the grid has already loaded it.
    import("hover-tilt/web-component").then(() => live && setArmed(true));
    return () => {
      live = false;
    };
  }, []);

  if (!armed) return <>{children}</>;

  return (
    // The same two props the grid settles on, minus the shadow: the scan
    // already carries a drop-shadow that follows its transparent corners, and
    // the library's own is a box behind it.
    <hover-tilt className="poke-tilt" tilt-factor="1" glare-intensity="0.5" glare-hue="200">
      <span
        className="poke-card"
        data-rarity={rarity?.toLowerCase() ?? undefined}
        style={scan ? ({ "--poke-scan": `url("${scan}")` } as CSSProperties) : undefined}
      >
        {children}
        <span className="poke-card__shine" aria-hidden="true" />
      </span>
    </hover-tilt>
  );
}
