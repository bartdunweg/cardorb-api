# Brand assets

The Card Orb mark, for use outside the iOS app — the website, docs, anywhere else.
Everything here is generated; do not hand-edit.

    swiftc -O -o /tmp/genicon Tools/GenerateAppIcon.swift && /tmp/genicon --web bright-bloom

Two cuts of the mark. Both are transparent — neither has a background:

- **`orb-*`** — the sphere alone, filling its box. Use it when the orb sits in a layout
  that already has its own depth, or where a shadow would fight the surrounding design.
- **`orb-shadow-*`** — the same sphere with the contact shadow that grounds it on the app
  tile, and the breathing room the shadow needs. Use it when the orb floats on a plain
  surface and should look like it's sitting on something. This is the closer match to
  the installed app icon.

| File | Use |
|---|---|
| `orb-{2048,1024,512,256,128,64}.avif` | the mark on transparency. **Serve these**, with the PNG as `<picture>` fallback. |
| `orb-1024.png` … `orb-32.png` | the same, as PNG. No 2048 PNG — see below. |
| `orb-shadow-*` `.avif` + `.png` | the shadowed cut, same sizes |
| `orb-tile-{1024,512,192,180}.{avif,png}`, `orb-tile-32.png` | the mark on its off-white tile — favicons, touch icons, anywhere it needs its own background |
| `og-image.{avif,png}` | 1200×630 social preview, the orb centred on the tile colour |
| `orb.svg`, `orb-shadow.svg` | simplified vector versions of the two cuts. See below. |
| `orb-tile.svg` | the installed app icon as vector — tile, squircle mask and shadow included, so it needs no mask of its own |

The shadowed cut renders the sphere smaller within the same box, so the shadow has
somewhere to fall. Set them at the same displayed size and the orb in `orb-shadow-*`
looks about 80% the diameter of the one in `orb-*`; size up if you need them to match.

Prefer AVIF: the mark is a smooth gradient, which PNG stores badly. The 512px mark is
157 KB as PNG and 8 KB as AVIF, pixel-for-pixel indistinguishable. There is no 32px
AVIF — at that size the PNG is already 2 KB and the container overhead dominates.

The gap widens with size, which is why the largest cut is AVIF only: at 2048 the AVIF is
37 KB and the PNG would be roughly two megabytes of smooth gradient. Any browser that
can display the orb at that size supports AVIF. If something genuinely needs a huge PNG,
render one — `--web` takes any size — rather than committing it here.

**For a large header**, serve `orb-2048.avif` through a `srcset` and let the browser pick:

```html
<img srcset="/brand/orb-512.avif 512w, /brand/orb-1024.avif 1024w, /brand/orb-2048.avif 2048w"
     sizes="(max-width: 768px) 60vw, 480px"
     src="/brand/orb-1024.png" width="480" height="480" alt="Card Orb">
```

The orb is a rendered material with no text and no fine detail, so it holds up scaled to
any size — there is no point below which it stops being legible, unlike a wordmark.

    <picture>
      <source srcset="/orb-256.avif" type="image/avif">
      <img src="/orb-256.png" width="128" height="128" alt="">
    </picture>

`alt=""` when the orb sits next to the words "Card Orb" — it is decorative there, and a
screen reader announcing "Card Orb Card Orb" is worse than silence. Give it a real `alt`
only when it stands alone as the link to the homepage. Same for `orb.svg`: it carries
`role="img"` and `aria-label="Card Orb"`, so add `aria-hidden="true"` when inlining it
decoratively.

`orb-tile.svg` shows the approximation most plainly, because there is more of the sphere
to look at: the render's diagonal horizon band becomes concentric rings, since the volume
layer is a radial gradient. Side by side at full size the two are clearly not the same
image; at 64 px they are hard to tell apart. Use it where a vector app icon is required
— a press kit, a slide, print — and the PNG or AVIF everywhere else.

The SVGs are an approximation, not a lossless export — a shaded chrome material has no
exact SVG expression. They read as the same object, round and glossy, and hold up down to
64 px, but carry less silver in the lit mass, a smaller specular, and only a hint of the
iridescent rim. Prefer the raster wherever one will do.
The reasoning is in git history.

The mark is the app icon's sphere without the tile, so it stays consistent with the
installed app. Retuning the icon and re-running `--web` keeps both in step.

## Putting it on the website

Raster, not SVG. The SVG is the fallback for places that demand vector; everywhere on a
web page the AVIF is both exact and smaller.

`cardorb` is a Next.js app, so the App Router file conventions do most of the work —
drop these in and the `<head>` tags are generated:

| Copy to | From |
|---|---|
| `app/icon.png` | `orb-tile-512.png` |
| `app/apple-icon.png` | `orb-tile-180.png` |
| `app/opengraph-image.png` | `og-image.png` |

For the mark inside a page — a header logo, say — serve AVIF with a PNG fallback:

```html
<picture>
  <source srcset="/brand/orb-256.avif" type="image/avif">
  <img src="/brand/orb-256.png" width="64" height="64" alt="Card Orb">
</picture>
```

Set `width` and `height` so the page does not jump while the image loads, and use
`alt=""` when the orb sits next to the words "Card Orb" — otherwise it is read twice.

`og-image` is the mark on its own, with no wordmark. If the social card should carry
text, that is a design decision for the site rather than something to bake in here.

These files are for hand-off: `cardorb.com` lives in the separate `cardorb` repository
and does not pick them up automatically.
