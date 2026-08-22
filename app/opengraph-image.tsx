import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { colour } from "../lib/design/theme-values";
import { APP_NAME, APP_TAGLINE_SHORT } from "../lib/core/config";
import { OG_IMAGE_ALT, OG_IMAGE_SIZE, OG_IMAGE_TYPE } from "../lib/core/og";

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
export const alt = OG_IMAGE_ALT;
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_TYPE;

/**
 * The mark, inlined.
 *
 * Satori has no filesystem — a `src="/brand/..."` is a path it cannot resolve
 * and an absolute URL would make this route fetch itself, so the bytes have to
 * be in the markup. Read once at module scope rather than per request, which
 * costs nothing here: this route takes no data and is built once (see the note
 * on `alt` above, and ADR-0035 for why what renders when matters on OG routes).
 *
 * PNG rather than the AVIF beside it. Everywhere else the AVIF is the one to
 * serve, but Satori does not decode AVIF and the failure is a blank space in
 * the card rather than an error anyone would notice.
 */
const ORB = `data:image/png;base64,${readFileSync(
  join(process.cwd(), "public/brand/orb-shadow-256.png"),
).toString("base64")}`;

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        // A row now, with the mark on the right. It was a column of three text
        // blocks centred in the frame; the words still are, and the orb takes
        // the space to their right that was empty.
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 56,
        background: colour.bgGrouped.light,
        padding: 80,
        fontFamily: "sans-serif",
      }}
    >
      {/* Every div carries an explicit display, including the ones with a
            single child. Satori has no default: a div with more than one child
            and no display throws, and the failure is the whole image 500ing
            rather than a layout that looks slightly off. */}
      {/* An explicit width, not flexGrow. Satori sizes a flexible column from
            its content, and the 76px heading's longest word made that column
            wider than the frame — the orb was pushed off the right edge and the
            card looked, from the outside, exactly like one that had not changed.
            700 + 56 + 264 is the 1040 that fits inside the padding. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 28, width: 700 }}>
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
      {/* Not next/image: this renders inside ImageResponse, which is Satori and
            not the browser, and only understands a plain img — same note as the
            collection's own card one directory over.

            The shadowed cut, because this sits on the flat grouped background
            with nothing else to give it depth, and no alt: the words beside it
            already say the name, and this file's `alt` export is what a screen
            reader is actually handed for the card as a whole. */}
      <img src={ORB} width={264} height={264} alt="" style={{ flexShrink: 0 }} />
    </div>,
    size,
  );
}
