import { ImageResponse } from "next/og";
import { APP_NAME, OWNER_NAME, PUBLIC_USERNAME } from "../../../lib/core/config";
import { stripPrices } from "../../../lib/core/cards";
import { getCards } from "../../../lib/core/collection";

/**
 * What a shared link looks like before anyone clicks it.
 *
 * Beside the route rather than at the app root, because this is the only page
 * worth previewing: everything else is a login or is behind one, and an OG
 * image on those would be an invitation to a door.
 *
 * Drawn rather than a static file, so it carries the real count. A collection
 * that says "1,612 cards across 49 sets" is a reason to open the link; a logo
 * is not. It is rebuilt on the same hourly revalidate as the page, so it never
 * disagrees with what you land on.
 */
export const runtime = "nodejs";
export const revalidate = 3600;
export const alt = `${OWNER_NAME}'s Pokémon card collection`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export async function generateImageMetadata() {
  return [{ id: PUBLIC_USERNAME, size, alt, contentType }];
}

export default async function Image() {
  // The same memo the page reads, so this is free inside the hour and never a
  // second walk of Notion. Prices come off for the same reason they do on the
  // page: this image is public in a way even the page is not, since a preview
  // is fetched and cached by anything the link passes through.
  const sets = stripPrices(await getCards());
  const held = sets.reduce((n, s) => n + s.cards.filter((c) => c.owned).length, 0);
  const withHeld = sets.filter((s) => s.cards.some((c) => c.owned)).length;

  // A handful of real scans, so the picture is of the collection rather than
  // about it. Taken from the newest sets, which is where the good art is.
  //
  // .png and not the .webp the grid uses: this is drawn by Satori, not a
  // browser, and Satori refuses webp outright ("Unsupported image type"). The
  // whole image 500s on it rather than dropping the one picture, so the format
  // is not a preference here.
  const scans = sets
    .flatMap((s) => s.cards)
    .filter((c) => c.owned && c.image)
    .slice(0, 5)
    // A swap, not an append: OwnedCard.image is already the whole URL down to
    // the file (".../me05/085/low.webp"), unlike CardDetail.image, which is the
    // base the extension goes on. Appending gave ".../low.webp/low.png" and
    // Satori dropped all five without failing the render, which is exactly the
    // kind of quiet nothing this image is supposed to avoid.
    .map((c) => ({ key: c.key, src: c.image!.replace(/\.webp$/, ".png") }));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#fafafa",
          padding: 72,
          fontFamily: "sans-serif",
        }}
      >
        {/* Every one of these carries an explicit display, including the ones
            with a single child. Satori has no default: a div with more than one
            child and no display throws, and the failure is the whole image
            500ing rather than a layout that looks off. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", fontSize: 30, color: "#767676" }}>{APP_NAME}</div>
          <div style={{ display: "flex", fontSize: 68, color: "#101010", fontWeight: 700 }}>
            {OWNER_NAME}&rsquo;s collection
          </div>
          <div style={{ display: "flex", fontSize: 34, color: "#4a4a4a" }}>
            {held.toLocaleString("en-GB")} cards across {withHeld} sets
          </div>
        </div>

        <div style={{ display: "flex", gap: 20 }}>
          {scans.map((c) => (
            // Not next/image: this renders inside ImageResponse, which is
            // Satori and not the browser, and only understands a plain img.
            <img
              key={c.key}
              src={c.src}
              alt=""
              width={196}
              height={274}
              style={{ borderRadius: 12 }}
            />
          ))}
        </div>
      </div>
    ),
    size,
  );
}
