---
id: ADR-0048
title: The orb becomes a wordmark, a brand page, and part of the social card
status: accepted
date: 2026-08-16
scope: repo
deciders: [Bart]
superseded-by: null
tags: [brand, wordmark, opengraph, brand-page, cross-repo, parallel-work]
---

# The orb becomes a wordmark, a brand page, and part of the social card

## Context and problem statement

The mark is generated in a different repository. `Tools/GenerateAppIcon.swift`
in `bartdunweg/cardorb-ios` renders the orb; `brand/` there holds its output,
along with a `README.md` whose closing section is titled **"Putting it on the
website"**, names this repository, and says the hand-off is manual:

> These files are for hand-off: `cardorb.com` lives in the separate `cardorb`
> repository and does not pick them up automatically.

**Half of that hand-off had already landed when this work started, and this
record exists partly because it did not know that.** PR #68
(`bartdunweg/orb-brand-assets`, merged 21:13) copied `public/brand/` across,
added `app/icon.png` and `app/apple-icon.png`, and restored the `icons` array in
`app/manifest.ts`. A second workspace began the same task from the same prompt
about twenty minutes later, found `origin/main` at the commit before that merge,
and rebuilt the asset copy from scratch. The duplicate work was thrown away in
the merge; what is written here is the part that had no counterpart.

That near-miss is the most useful thing in this record, so it goes first rather
than in a footnote: **`origin/main` moves during a session.** The branch was
cut, verified, documented and readied for merge against a `main` that had gained
four merges in the meantime. Nothing failed loudly — the two brand directories
were byte-identical where they overlapped, so the conflict surfaced as two files
rather than as a broken build. Re-fetch before writing a record that claims
something does not exist.

What PR #68 did **not** do, and what this record covers:

- The name was still bare type, set with the same class string copied into four
  files: `Navbar.tsx`, `CardsSidebar.tsx`, `MarketingFooter.tsx` and
  `app/(app)/loading.tsx`. The site had an icon in the tab and no mark on the
  page.
- The social card was three lines of type on white.
- The rules for using the mark existed only as `brand/README.md` — now served
  verbatim at `/brand/README.md`, which is a generator hand-off document rather
  than something written to be read by a person who wants to use the logo.

## Decision

### One `Wordmark`, four call sites

`app/components/Wordmark.tsx` is the mark and the name together. Four hand-copied
class strings were survivable while the mark was a word; adding an image to four
copies is how the fifth one gets forgotten — the argument `Navbar.tsx` already
makes in its own docblock.

`href` decides what it is: with one it is the way home (nav, rail), without one
it is a signature (footer, loading fallback). AVIF with a PNG fallback via
`<picture>`, `alt=""` and `aria-hidden` because it sits beside the word it would
otherwise be read out twice with.

The `app/(app)/loading.tsx` call site is load-bearing rather than decorative.
ADR-0046 established that the fallback may draw only what is identical on every
signed-in route, and the rail's head is one of those things. Left as bare text
there, the name would have slid left by the width of the orb at the moment the
page arrived — the class of jump FB-0010 was reported for.

### `/brand`, and the half of the source of truth that lives here

`app/brand/page.tsx`: both cuts on light and dark, the tile, the colours read
live from `lib/design/tokens.ts`, the usage rules, and direct downloads.

The split is deliberate and worth stating plainly, because "where does the brand
live" has a tempting wrong answer:

- **The drawing is generated**, by the Swift tool in cardorb-ios. That is the
  origin and it stays there. A Swift toolchain has no business in a Next.js
  repository, and forking the render is how the site and the installed app stop
  matching.
- **Everything downstream lives here**: the served files, the colours, the rules.

Colours are read from `tokens.ts` rather than typed out. A brand page with
hand-copied hex values is wrong within a month and confidently so, and the whole
argument for the page living in this repository is that the colours are already
here as code.

Consequence worth naming: the `/brand/…` paths are a public contract now, so the
filenames are fixed. That is the point of them — cardorb-ios can drop its second
copy of these files and link here for everything except the app icon, which a
bundle genuinely cannot fetch.

### The social card keeps its words

`brand/og-image.png` is the orb centred on the tile colour with no text, and the
generator's README says adding text is "a design decision for the site". The
site's card already carried the name, the headline and the short tagline, and a
link preview with a sentence in it beats one with a sphere in it. So the orb
joins the existing card rather than replacing it, inlined as base64: Satori has
no filesystem, and an absolute URL would make the route fetch itself.

## Alternatives considered

1. **Ship only the assets, as PR #68 did.** Fixes the tab and leaves the page.
   Rejected here because the missing icons were a symptom: the name was still
   type in four files and the rules were still in another repository.
2. **Move the generator into this repository.** Would make "source of truth"
   unambiguous. Rejected: Swift in a Next.js repo, and the app icon would be
   rendered somewhere other than where the app is built.
3. **Replace the social card with `og-image.png`.** One fewer moving part and no
   base64. Rejected: trades a preview that says what the product is for one that
   says only that it is round.
4. **`/brand` indexed, as a sixth public route.** Rejected: the root layout
   noindexes by default and five routes opt back in for reasons of their own.
   This is a hand-off page for somebody who already has the link. It is reachable
   from the marketing footer, which is deliberate — noindex and in no sitemap
   means that row is the only way to arrive at it.
5. **Reuse `LegalPage.tsx` for `/brand`**, which ADR-0042 asks be considered
   before adding a third long-form page. Its *type scale* is reused. Its shell is
   not: it requires an `updated` date this page has no use for, and caps its
   column at `--content-max` (~70 characters), right for a document to be read
   and wrong for a page whose subject is images side by side.

## Consequences

- Any new place that signs the product should use `<Wordmark />` rather than
  setting the name in type.
- `app/opengraph-image.tsx` reads a file at module scope. It remains static — no
  data, no fetch, no `revalidate` — so this happens at build. ADR-0035 is the
  record on why static-versus-dynamic matters on that route specifically.
- The OG card's text column has an explicit `width: 700` rather than `flexGrow`.
  Satori sized the flexible column from its content, the 76px headline made it
  wider than the frame, and the orb was pushed off the right edge — a failure
  that looks, from outside, exactly like a card that never changed. Found by
  rendering it and looking at it; it would not have failed a build.
- `public/brand/README.md` is now a public URL, inherited from PR #68. It is the
  generator's hand-off note, not documentation for a reader, and `/brand` is the
  page that is. Not removed here — it came from another branch and deleting
  somebody else's file is not this change's business — but it is the obvious
  thing to reconsider next time that directory is touched.
- ADR-0049 amends the favicon half of what PR #68 shipped.
- cardorb-ios can now delete its committed copies of everything except
  `AppIcon.appiconset`. That is a separate change in that repository.
