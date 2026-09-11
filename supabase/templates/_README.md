# The three emails this app sends

Written out rather than left to Supabase's defaults, for two reasons.

The first is trust. These are the only messages Card Orb sends to somebody who
has not signed in yet, and every one of them is "click this link to get access".
That is the exact shape of a phishing mail, so the things that tell a person it
is genuine — the product's name, why they are getting it, what happens if they
ignore it — have to be in the message rather than assumed.

The second is technical, and it is the reason these could not be left alone even
if the wording were fine. The default templates link to Supabase's own verify
endpoint, which verifies the token and then redirects. This app has its own
route at /auth/confirm, which exchanges the token for a session *and writes the
cookies* — a redirect cannot do that, because only a route handler can set them.
So every link below is built by hand from `{{ .TokenHash }}` and points at that
route.

`type` is hardcoded per template rather than templated, because each of these
files is only ever used for one kind of link and a wrong `type` fails in a way
that reads as "the link is broken".

Plain HTML, inline styles, no images. A mail client is not a browser: half of
them strip <style> blocks, and a remote image is both a tracking pixel to the
suspicious and a broken box to anyone whose client blocks it by default.

## Generated, not written here

The three HTML files are the output of `pnpm emails:render` in cardorb-web, where
the emails live as React components on Untitled UI's email kit
(`src/emails/`, `src/components/emails/`). Change the wording or the look there,
render, and copy the three files into this directory; a hand edit here is
overwritten by the next render. The Go placeholders (`{{ .SiteURL }}`,
`{{ .TokenHash }}`, `{{ .Email }}`, `{{ .NewEmail }}`) pass through the render as
text, and the `&` between query parameters comes out as `&amp;`, which every
mail client decodes.

## The shape of each one

The same skeleton three times, so a person who has seen one recognises the next:
the product's name above, a heading that says what the mail is for, one sentence
of context, one pill button, the same link written out under it for the client
that will not render a button, then the small print (how long the link lasts,
what happens if you ignore it) and a footer that names the address it was sent
to and why. A hidden first line gives the inbox its preview text.

The `next=` parameter is gone from the links: the web app's `/auth/confirm`
decides where to land from `type` alone.
