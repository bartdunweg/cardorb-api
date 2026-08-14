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
