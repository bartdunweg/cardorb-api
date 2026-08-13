import { ImageResponse } from "next/og";

/**
 * The favicon, which this app did not have.
 *
 * Without one a browser shows the globe-and-blank-page placeholder, and every
 * pinned tab and every bookmark of this collection looked like an unfinished
 * site. Search engines draw it beside the result too, so it is one of the few
 * pieces of "SEO" that is literally a picture of whether anyone bothered.
 *
 * Drawn rather than a committed .ico or .png, because a binary in the tree is a
 * thing nobody can edit or diff. It is generated once at build time and cached
 * like any other static asset — the cost is a build step, not a request.
 *
 * A "P" on the same near-black the primary button uses. Not the collection's
 * artwork: at 32 pixels a card scan is a smudge, and at 32 pixels one letter is
 * the only thing that survives.
 */
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        // The token's value, written out: this renders in Satori and not in a
        // browser, so there is no stylesheet here to read a custom property
        // from. If --btn-primary-bg moves, this moves.
        background: "#111111",
        color: "#ffffff",
        fontSize: 22,
        fontWeight: 700,
        // Not the app's own faces either. Satori needs the font bytes handed
        // to it, and loading Satoshi for one glyph on an icon nobody reads as
        // type is not worth the build time.
        fontFamily: "sans-serif",
        borderRadius: 7,
      }}
    >
      C
    </div>,
    size,
  );
}
