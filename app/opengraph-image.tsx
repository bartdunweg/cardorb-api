import { ImageResponse } from "next/og";
import { colour } from "../lib/design/tokens";
import { APP_NAME, APP_TAGLINE_SHORT, APP_TAGLINE } from "../lib/core/config";

/**
 * What a link to this app looks like before anyone clicks it.
 *
 * At the app root, so it answers for every route that does not draw its own.
 * That is deliberate rather than incidental: the collection at /user/<name> has
 * an image of the actual cards, which is a better reason to open a link than a
 * name is, and everything else — the landing page, the login, a 404 — is better
 * served by the name than by nothing. Without this file those routes preview as
 * a bare URL, which is what an unfinished site looks like in a chat window.
 *
 * Static: no data, no fetch, no revalidate. It is built once and it is the same
 * picture forever, unlike the collection's, which carries a live count.
 */
export const alt = `${APP_NAME} — ${APP_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        background: colour.bgGrouped.light,
        padding: 96,
        fontFamily: "sans-serif",
      }}
    >
      {/* Every div carries an explicit display, including the ones with a
            single child. Satori has no default: a div with more than one child
            and no display throws, and the failure is the whole image 500ing
            rather than a layout that looks slightly off. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        <div
          style={{
            display: "flex",
            fontSize: 28,
            letterSpacing: 4,
            textTransform: "uppercase",
            color: colour.labelTertiary.light,
          }}
        >
          {APP_NAME}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 76,
            lineHeight: 1.1,
            color: colour.label.light,
            fontWeight: 700,
          }}
        >
          Your Pokémon card collection, sorted.
        </div>
        {/* The short tagline, which lives in config.ts beside the long one — it
              used to be typed out here, where nobody would think to look for a
              sentence that had drifted. */}
        <div style={{ display: "flex", fontSize: 32, color: colour.labelSecondary.light }}>
          {APP_TAGLINE_SHORT}
        </div>
      </div>
    </div>,
    size,
  );
}
