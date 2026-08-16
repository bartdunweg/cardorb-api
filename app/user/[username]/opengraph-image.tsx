import { ImageResponse } from "next/og";
import { colour } from "../../../lib/design/tokens";
import { APP_NAME } from "../../../lib/core/config";
import { forPublic } from "../../../lib/core/cards";
import { getCards, ownerOf } from "../../../lib/core/collection";
import { ownerLabel } from "../../../lib/core/owner";

/**
 * What a shared link looks like before anyone clicks it.
 *
 * Beside the route rather than at the app root, because this is the only page
 * worth previewing: everything else is a login or is behind one, and an OG
 * image on those would be an invitation to a door.
 *
 * Drawn rather than a static file, so it carries the real count. A collection
 * that says "1,612 cards across 49 sets" is a reason to open the link; a logo
 * is not.
 */
export const runtime = "nodejs";

/**
 * Dynamic, for the same reason the page beside it is, and it took a production
 * 500 to make that explicit.
 *
 * This used to say `revalidate = 3600` and nothing else, which asks Next to
 * render the image statically. It cannot be: ownerOf() reads a profile through
 * a cookie-bound Supabase client, and a static render has no cookies to give
 * it — "couldn't be rendered statically because it used `cookies`", every
 * request, once the page's generateStaticParams stopped supplying a
 * prerenderable username to paper over it. The config was wrong before that
 * change; the change is what stopped hiding it.
 *
 * The freshness argument is the page's argument. /user/<name> is force-dynamic
 * so that turning sharing off takes effect on the next request rather than on
 * the next revalidate, and an image that outlived that switch by an hour would
 * be the same leak in a different file.
 *
 * The cost of that is real and small: force-dynamic makes Next answer
 * `no-store`, overriding any Cache-Control set on the response (tried, and
 * measured — it does not survive), so the picture is drawn per request. What is
 * expensive here is the collection, and that is still cached across requests by
 * getCards()'s own unstable_cache; what is left is Satori drawing a header and
 * five scans, for a scraper rather than for a person, on a route nothing
 * renders in the critical path.
 */
export const dynamic = "force-dynamic";
/**
 * Deliberately nameless, unlike the picture itself.
 *
 * `alt` is a module-level export: Next reads it once to build the meta tag, so
 * it cannot see which profile is being drawn. It used to name the deployment's
 * owner, which made it wrong for everybody else rather than merely vague. The
 * drawn image below does say whose collection it is, and that is the copy a
 * person actually sees in a preview card.
 */
export const alt = "A Pokémon card collection";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * One image per profile, named after the profile.
 *
 * It used to return the one username the deployment had in its environment,
 * which was true while there was one collection and became a way of drawing
 * every visitor the same picture.
 *
 * `params` is typed as possibly absent and possibly a promise on purpose. The
 * docs call it optional, and the build proved why: collecting the metadata for
 * `[__metadata_id__]` calls this to enumerate the images, and reading
 * `params.username` off nothing is what broke the build rather than anything at
 * request time. Awaiting a value that may not be a promise is harmless; reading
 * a property off undefined is not.
 */
export async function generateImageMetadata({
  params,
}: {
  params?: { username: string } | Promise<{ username: string }>;
}) {
  const resolved = params ? await params : null;
  const username = resolved?.username;
  // Nothing to enumerate without a name. The route is dynamic, so the image is
  // drawn on request when the name is known.
  return username ? [{ id: username, size, alt, contentType }] : [];
}

export default async function Image({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;

  // The same lookup the page does, and for the same reason it had to become a
  // lookup: this used to call getCards() with nothing, which resolved to the
  // Notion placeholder id, which Postgres cannot parse. The walk failed, the
  // fail-soft catch returned an empty collection, and the preview of a public
  // collection said it held nothing.
  const owner = await ownerOf(username);

  // Prices come off for the same reason they do on the page: this image is
  // public in a way even the page is not, since a preview is fetched and cached
  // by anything the link passes through.
  const sets = owner ? forPublic(await getCards(owner.id)) : [];
  const held = sets.reduce((n, s) => n + s.cards.filter((c) => c.owned).length, 0);
  const withHeld = sets.filter((s) => s.cards.some((c) => c.owned)).length;

  // A handful of real scans, so the picture is of the collection rather than
  // about it. Taken from the newest sets, which is where the good art is.
  //
  // .png and not the .webp the grid uses: this is drawn by Satori, not a
  // browser, and Satori refuses webp outright ("Unsupported image type"). The
  // whole image 500s on it rather than dropping the one picture, so the format
  // is not a preference here.
  // Whose it is, drawn rather than configured. A display name is up to sixty
  // characters and a username up to thirty, and either can be a good deal
  // longer than "Bart" — so the heading steps down and is allowed to wrap onto
  // a second line instead of running off the canvas. Two lines at 48px still
  // clears the row of scans below; a third would not, and no name that fits the
  // column reaches one.
  const heading = `${ownerLabel(owner ?? { username, displayName: null })}’s collection`;
  const headingSize = heading.length > 40 ? 40 : heading.length > 24 ? 48 : 68;

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
          background: colour.bgGrouped.light,
          padding: 72,
          fontFamily: "sans-serif",
        }}
      >
        {/* Every one of these carries an explicit display, including the ones
            with a single child. Satori has no default: a div with more than one
            child and no display throws, and the failure is the whole image
            500ing rather than a layout that looks off. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", fontSize: 30, color: colour.labelTertiary.light }}>{APP_NAME}</div>
          <div
            style={{
              display: "flex",
              fontSize: headingSize,
              color: colour.label.light,
              fontWeight: 700,
            }}
          >
            {heading}
          </div>
          <div style={{ display: "flex", fontSize: 34, color: colour.labelSecondary.light }}>
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
