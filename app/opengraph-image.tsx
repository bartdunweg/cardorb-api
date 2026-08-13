import { ImageResponse } from "next/og";
import { APP_NAME, APP_TAGLINE } from "../lib/core/config";

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
        background: "#fafafa",
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
            color: "#767676",
          }}
        >
          {APP_NAME}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 76,
            lineHeight: 1.1,
            color: "#101010",
            fontWeight: 700,
          }}
        >
          Your Pokémon card collection, sorted.
        </div>
        {/* The tagline, cut at the clause: the whole sentence at this size is
              four lines and a preview card is not somewhere anyone reads four
              lines. */}
        <div style={{ display: "flex", fontSize: 32, color: "#4a4a4a" }}>
          Set by set — what you own, what it is worth, what is missing.
        </div>
      </div>
    </div>,
    size,
  );
}
