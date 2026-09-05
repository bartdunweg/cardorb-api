# Changelog

Generated from the fragments in `changelog.d/` by `npm run changelog`.
Do not hand-edit this file; add a fragment instead. `scripts/verify.sh` fails
if the two have drifted apart.

## 2026-09-06

- A Pokédex setting can name `kinds` of card (V, ex, GX, …) beside `rarities`, for what a rarity cannot tell apart: a full-art V and a full-art ex are both Ultra Rare.

- An unreadable pokemontcg.io index is no longer cached for a day as "nothing to price"; a set's gallery cards get their TCGplayer price too; a card one market prices keeps that market's shape; "SV01" and "SV1" are one number.

- TCGplayer's price finds a promo whose number it prefixes (SWSH282, XY150a) from the collection's plain number.

- A public item's `favorite` is read off the owner's copy, so `list=favorites` lists the starred cards rather than nothing; unset for everyone whose favorites are not shown.

- The favorites and the Pokédex can show on the public profile, each behind its own flag (`favoritesPublic`, `pokedexPublic` on the profile); `GET /v1/public/{username}/cards` takes `list=favorites` and `list=pokedex`, a public item says whether it is a favorite, and the public profile carries the owner's Pokédex setting while the Pokédex is shown.

- The dollar rate is read from frankfurter's new host, and a failed read is not cached: a null kept for a day was a day without TCGplayer prices.

- A card TCGdex is asked about carries TCGplayer's dollars too, so a promo Cardmarket does not price gets its second price from TCGdex when pokemontcg.io has none or is down.

- TCGplayer's prices live in a day-long cache of their own per set, blended into the set's facts on read; a failed pokemontcg.io call is not cached, so an outage costs the second price for minutes, not a day.

- While pokemontcg.io is down, a set keeps the TCGplayer prices it last got on that instance rather than showing its cards unpriced for the quiet minutes.

## 2026-09-05

- Starring a card, changing how many you hold or adding a note no longer makes the next screen wait for the whole collection to be matched and priced again: what the catalogue says about each card is kept per set for a day, and only your own rows are read afresh.

- Making a folder no longer drops the assembled collection from the cache, only the folder
  list: a new folder changes no card, and the rebuild cost every read after it twenty seconds
  on a large binder. Deleting a folder still drops both, since that unfiles cards.

- `GET /v1/cards` says what the list is worth: `value` and `unpriced`, over the whole filtered
  list rather than the page, and a wishlist's facets now name its own sets and rarities. `sort=dex`
  puts the copies in national Pokédex order, trainers and energy last. A folder may be shown as a
  Pokédex: `pokedex` on `POST /v1/folders` and `PATCH /v1/folders/{id}` takes whether the missing
  Pokémon show and the range collected, `null` turns it off; the built-in Pokédex takes the same
  setting from `PATCH /v1/profile { pokedex }`.

- A Pokédex setting can name `rarities`: only cards of those rarities fill the slots, for a Pokédex of full-art cards. On the profile's setting and on any folder shown as a Pokédex.

- A card Cardmarket has only a lowest listing for shows that listing as its price, rather than no price; the collection's value counts it.

- `GET /v1/cards?priced=false` lists the copies nothing prices, the ones the collection value leaves out; `priced=true` the rest.

- A folder can be shown on your public profile: `isPublic` on `POST` and `PATCH /v1/folders`, off by default. `GET /v1/public/{username}/folders` lists the ones you show, with how many cards each holds, and `GET /v1/public/{username}/cards?collection=` narrows the public list to one of them.

- A public card carries `imageHigh`, the larger scan, so a public page draws the same picture the owner sees.

- The wishlist can show on a public profile: `wishlistPublic` on `PATCH /v1/profile`, off by default, read back on the profile and on `GET /v1/public/{username}/profile`; `GET /v1/public/{username}/cards?list=wishlist` lists the cards the owner is looking for.

- Three answers put right after review. `GET /v1/cards?collection=` on a rule folder now
  keeps its matches when `owned=false` is also given, as the contract said. A folder body may
  be 8 kB, so a rule with twenty sets and twenty rarities is no longer refused as too large.
  `GET /v1/folders` carries `catalogueUnavailable` during a TCGdex outage, when a rule
  folder's `count` is low for want of Pokédex numbers and set titles.

- A folder may now carry a rule and fill itself: `rule` on `POST /v1/folders` and
  `PATCH /v1/folders/{id}` takes a Pokédex range (`dex.from`–`dex.to`), sets and rarities, AND
  between the fields and OR within a list, and the folder then shows every owned copy that
  matches. `GET /v1/folders` says each folder's `kind` (`manual` or `rule`) and its `rule`, with
  `count` counting what it holds either way. `GET /v1/cards?collection=` answers a rule folder
  with its matches, and an id that is no folder is a 404 rather than an empty page.
  `PATCH /v1/collection/items/{id}` refuses to file a copy into a rule folder. A folder keeps
  its kind: a manual one cannot be given a rule, and a rule one cannot lose it.

- A card Cardmarket publishes nothing for is priced from TCGplayer, in euros at the day's ECB rate; old promos in a collection count towards its value now.

- TCGplayer's set prices are asked for with a longer wait and three tries, and card by card where the search still fails, so a slow or failing pokemontcg.io no longer leaves a set without its second price for a day.

## 2026-09-04

- The card list (`GET /v1/cards`) now names the sets and rarities you hold beside every page, so a list page no longer has to fetch the whole collection to draw its filter menus.

- The collection survives a TCGdex outage. `GET /v1/cards`, `/v1/collection`, `/v1/stats`, `/v1/pokedex` and the three public routes used to answer 503 for as long as TCGdex was unreachable, which took every page of the web app down with them; they now serve the rows alone, without a scan, a catalogue id or a price, with `catalogueUnavailable: true` beside the answer. Nothing caches an outage answer: the hour-long entry stays empty until TCGdex is back, and the public routes send `no-store` for it.

- A public collection can be narrowed by set or rarity and sorted by name, and its page names every set and rarity it holds, so a visitor can filter someone's collection the way the owner filters their own.

- A public collection's rarity menu names each rarity once, even where the catalogues spell it two ways.

- The set list (`GET /v1/catalog/sets`) counts the distinct cards you own of each set, not copies: a second Charizard no longer reads as one card closer to complete, and `ownedCount` never exceeds `total` (#162).

## 2026-09-03

- `GET /v1/cards` sorts (`sort=set|name|price|added`, `order=asc|desc`) and narrows to one set or one rarity (`set=`, `rarity=`), so a list can be ordered by value or by the day a card came in without fetching the whole collection.

- A catalogue that accepts the connection and never answers is given up after eight seconds instead of holding the request until the platform's limit, so an outage like TCGdex's on 2026-09-02 costs a moment rather than minutes per page.

- The contract and the answers agree, in six places. Every 429 carries `Retry-After`, the whole seconds until one more request is let through. Every 401 says `Sign in first.`; `authorise()` used to say `Sign in to see this.`. The three catalogue routes answer `The catalogue did not answer. Try again in a moment.` at 502 instead of the slugs `catalog-unavailable` and `search-unavailable`. `GET /v1/folders` carries `collectionUnavailable: true` when the store could not be read, so `count: 0` on every folder is not mistaken for empty binders, and the four folder operations list their 502. `POST /v1/collection` refuses an unknown `finish` with a 400 like `PATCH` does, where it used to turn it into null. `GET /v1/cards` documents `limit` and `offset`; `GET /v1/profile`, `GET /v1/imports`, `GET /v1/collection` and `GET /v1/cards/{tcgId}` carry the read headers on every answer, refusals included, so a browser on an allowed origin can read a 401, 429 or 503.

- Five answers put right. `PATCH` and `DELETE /v1/collection/items/{id}` say `404 No such card.` for a copy that is not there or not yours, where they used to answer 502 or a hollow `ok`. A store failure answers one fixed sentence per operation instead of the database's own words, and a deployment with no database answers the documented 503. `GET /v1/cards/{tcgId}` and `GET /v1/public/{username}/cards/{tcgId}` answer 503, uncached, when TCGdex is down, and 404 only for a card it does not have. Sorting `GET /v1/cards` by price values a holo copy at the plain price, as every other figure already did. The four public routes are cached at the CDN for a minute and never served stale, so a profile turned private is gone within that minute rather than up to an hour later.

- `GET /v1/stats` says what the collection is worth today (`value`, in euros) and how many copies carry no price (`unpriced`), so a dashboard can show the figure without adding up pages.

## 2026-09-02

- The API now has a contract and a home of its own. `openapi.yaml` describes every
  route under `/api/v1`, a plain-HTML reference is at `/docs/api`, and `api.cardorb.com`
  serves the same API as `/v1/…` once the domain is attached. Every failure answers
  `{ "error": "<sentence>" }`; the one that did not (the health check) now does, and the
  four wordings of "no database" are one.

- `api.cardorb.com` is attached and live, and the README says so: its examples read
  `api.cardorb.com/v1/…` instead of `cardorb.com/api/v1/…`, which since 2026-09-02 answers
  from the new web app's own API. The npm package is `cardorb-api`, so deployment URLs stop
  being named `cardorb-<hash>`.

- The API grew what the web app needs to stop reading the database itself: `GET /v1/cards`
  answers one page of the collection as a flat list (search, wishlist, favourites, folder,
  paging), `GET /v1/stats` the dashboard's numbers, `GET /v1/pokedex` the 1,025 slots with a
  count and a picture each, and `/v1/folders` makes, renames and deletes the folders a person
  sorts cards into. A copy now carries `collectionId`, and `PATCH /v1/collection/items/{id}`
  files it. Everything under `/v1` that existed keeps its shape.

- The web tool is gone from this repository, and with it every page: the signed-in
  screens, login and signup, the public profile, the marketing and legal pages, the
  brand page and the rendered API reference. cardorb.com is `bartdunweg/cardorb-web`
  now, and that is where the reference will be rebuilt, in the same theme as the rest
  of the site, from `/openapi.yaml` on this host. Until then `api.cardorb.com/` answers
  with the contract itself. Nothing under `/v1` changed.

- A set whose records TCGdex could not deliver is no longer remembered as empty for a day: the API asks again on the next request, so a short outage at TCGdex costs a moment rather than a day of cards without pictures.
- `GET /v1/public/<username>/cards` also says how many sets the collection spans, so a profile page can show that without fetching the whole collection.

- A request that carries an account credential is no longer held to ten a minute per address.
  That ceiling was for guessing the old passcode, and the web app's servers make requests for
  every visitor from a handful of shared addresses; they are held to six hundred a minute now,
  and a request with nothing to show is still held to ten.

- A collection that could not be built — the store or the card catalogue unreachable — is
  a 503 nothing caches, on every route that reads it. It used to be an empty 200 that the
  cache kept for an hour, and the catalogue half was kept for a day: one 404 from TCGdex's
  set index during a build left every card without a picture, a price or an id for every
  app at once.

- Every failure under `/v1` is written by one helper now. The 140 hand-typed `{ error }`
  answers across 31 route files were rewritten to `apiError()`; nothing a client sees changed.

- The shared passcode (`CARDS_TOKEN`, the `x-cards-key` header) is gone. Every caller is an
  account now: a Supabase access token as bearer, or the session cookie on this origin. No
  client of ours sent it any more; a request that still does is refused like any other
  unsigned request.

- A card's price comes from Cardmarket's own price guide now — one file, read once a day —
  instead of one TCGdex request per card. A cold build of the collection used to take minutes,
  during which the first visitor after a deploy waited or gave up; it takes seconds. TCGdex is
  asked only for a card the guide does not know yet, and the numbers agree with the nightly
  snapshot to the cent.

- `GET /v1/public/<username>/cards` answers one page of a public collection as a flat list —
  `q`, `limit`, `offset` — one entry per card with its copy count, nothing private, for a page
  that shows a hundred cards without fetching nineteen hundred.

- `GET /v1/public/<username>/profile` answers the name to print and the picture, so a page
  can draw a public collection's header without a key. No prices, no email, same limiter and
  cache as its two siblings.

- A public profile's collection is read again. The anonymous role may read only the public
  columns of `cards` since the web app's schema review, and the three public routes read the
  whole row as anonymous, so they answered every visitor with an empty collection — cached at
  the CDN for an hour. They read as the service role now, scoped to the one public profile, and
  a failed read is a 503 nothing caches rather than an empty 200.

- `api.cardorb.com/` sends a visitor to the reference again: the web app draws it from this
  contract at cardorb.com/docs/api, in the site's own theme.

## 2026-08-23

- You can now remove your profile picture, not only replace it — a Remove button sits beside Change, and it clears the picture from your profile and the public page.
- Deleting your account now opens a confirmation dialog that asks for your password again, and that password is checked on the server before anything is removed — so a signed-in session left open cannot end the account in one click.

- The Settings screen is rebuilt on Untitled UI's two-column layout: each section — Profile, Account, Import, Appearance, and delete — shows its title and a one-line description in a column on the left, with the fields in a card on the right, divided from the next section.
- Every field now has a visible label, the Save button sits next to the field it saves, and the light/dark picker is a segmented control.
- The page opens with a short description of what Settings is, rather than printing your email address at the top.
- Control edges — the borders on inputs and buttons across the whole app — are lighter, matching Untitled UI's own softer edge.

- Each group on the Settings screen now carries a short description under its heading and a divider between groups, so Profile, Account, Import, Appearance and "Delete this account" read as clear, separate blocks.
- On the Appearance picker, the mode you have chosen is now marked with a checkmark, not by colour alone.
- Saving a setting — and any error — is now announced to screen readers instead of appearing silently.

## 2026-08-22

- Request size limits now count bytes rather than characters. Anything you sent
  with accents or non-Latin script was measured short, so a field capped at
  4 kB accepted up to twice that. Nothing you can do in the app came near either
  number; this closes the gap rather than fixes a symptom.

- Buttons, search fields and segmented controls are now capsules rather than
  rounded rectangles, with a little more room at their ends. The old rectangle
  shape is still available and unchanged, for the places that ask for it.

- Every card in your collection can now be reached and opened with a keyboard.
  They could not be: each card sat in a wrapper the browser gives no shape to,
  and a shapeless element cannot be focused, so tabbing through the page skipped
  all 1,600 of them. Nothing about the page looks different.

**Changing your password now asks for your current one.** Until now a signed-in
browser was enough — so anyone who found your screen unlocked could change your
password, which signs you out of your own account, and go on from there to your
email address and to deleting the account.

Resetting a forgotten password is untouched. If you arrive from a link in a
reset email you are not asked for the old password, because not having it is why
you are there. The screen is the same one either way; it now knows which of the
two brought you.

If you type the wrong current password it says so, instead of telling you the
new one could not be set.

- The dashboard's "By era" and "By type" titles now use the same heading weight and size as every other section heading in the app, instead of a slightly smaller, off-scale one.

- Every dialog and sheet — the card view, Add a card, Filter and View — now runs
  on the same component library as the rest of the app instead of on hand-written
  code of our own. What you should notice: nothing, except that they open and
  close with a slightly different movement.
- Filter and View on a phone can be tabbed through with a keyboard again. They
  used to trap you: once you were in, no key got you out, which also affected
  anyone using a desktop at 200% zoom.
- Opening a card from halfway down your collection still leaves the page exactly
  where it was, and the bar along the bottom no longer flinches as a dialog opens.

- The collection, the dashboard and public profiles now sit on the same page background as the rest of the site, so the sidebar, the set panels and the card hover all stand out against it instead of blending in.
- The fade behind the mobile tab bar no longer ends in a visible band in dark mode.
- The browser's own top and bottom bars are tinted the colour of the page again, closing a seam that showed on iPhone.

- A page that fails outside the signed-in area — the homepage, a shared profile link, the legal pages, the sign-in screens — now shows Card Orb's own error page with a way back and a reference code, instead of the browser's blank default.

### Changed

- The Set and Type fields in "Add a card" now use a real suggestion list instead
  of the browser's own. The suggestions open on focus, are announced properly by
  a screen reader, and typing something that is not on the list still works —
  so a card from a set the catalogue has not indexed yet can still be filtered
  for.

### Changed

- The styling is rebuilt on three layers — `styles/theme.css` (tokens),
  `styles/globals.css` (base) and `styles/app.css` — with `theme.css` as the
  only place any design value is written down. Untitled UI's palette is taken
  name-for-name and its light and dark halves are folded into one `light-dark()`
  declaration per colour, so no colour exists twice. Shipped CSS drops from
  205 kB to 179 kB.
- Body and secondary text are slightly darker in light mode (`#111111` →
  `#171717`, `#666666` → `#404040`), because Card Orb's label colours now point
  at Untitled UI's text tokens instead of being written out separately. Higher
  contrast, not lower.

- Every tab in the mobile tab bar is now the same width — the width of the widest one — so the "You" tab no longer sits narrower than the rest.
- The add button has moved out of the mobile tab bar and onto the dashboard, beside its heading, which is what makes room for the tabs to be equal. Adding a card from a phone starts on the dashboard for now.

- Pointing at a card no longer makes it flash before it tilts. The effect used to be
  put on screen a moment before the code that draws it had arrived.
- A card whose picture failed once and recovered keeps the picture it recovered with,
  instead of losing it again the first time you point at it.

- Signed-in screens now show the Card Orb mark while they load, instead of a grey outline of a page that was not the one you were opening. It fades in only if the wait is long enough to notice.

- The "Value over time" chart on the dashboard now has a real X and Y axis with readable, rounded euro values, faint horizontal gridlines and no dots on the line — a dot appears only where you point. It is drawn in the brand colour and is taller.
- The chart's dates are spaced by how far apart the readings actually are, so a long gap in the record looks like a long gap instead of a single step.
- Your collection's value is now recorded once a night instead of once a week, so the chart fills in roughly seven times faster from here on.

## 2026-08-21

- The search box in "Add a card" is now the same size as every other field in the app. It was rendering at half again the size, and anything you typed into it came out oversized and bold.

- Adding a card no longer asks you to type the generation. It comes from the card itself, like the rarity and the type already did — so the only things left to answer are whether you own it and whether to keep it out of the latest pull.
- Cards filed under "X&Y" now say "XY", matching every other era name, so the era filter lists one entry per era instead of two spellings of the same one.

- The brand page shows the Card Orb wordmark again in dark mode. It was drawn in near-white on a white panel, so the name was invisible on the one page whose job is showing how the name is used.
- "How it works" in the landing page's menu now goes to the How it works section. It went to Features.

- The collection screens are drawn entirely from the shared design system now, with no stylesheet of their own.

- The View and Filter buttons, the grouping tracks and the close button all wear the same surface as every other control in the app, instead of a separate glass recipe that only they used.

- When the collection cannot be loaded, the dashboard now says so instead of showing "0 cards, €0" as though the collection were empty.

- The filter and view panels on a phone can be used with a keyboard again. Opening one used to leave the keyboard stuck outside it, so none of the options could be reached — only Escape worked.

- Text sizes no longer stretch with the width of the window. Every size is one of a fixed set now, so a heading is the same size on a laptop as on a large monitor.

- A public collection page now downloads about 120 kB less: a charting library was being sent to five screens that never draw a chart.

- The public card lookup, the CSV import and the avatar upload are now rate limited, like every other endpoint already was. Nobody using the app normally will meet these limits.
- Checking whether a username is free now only answers this site's own sign-up form, not a script running on someone else's page.
- An avatar upload is now checked against the actual file, not just what the upload claims it is.

- The buttons and the badge on the landing and iPhone pages are the same components as everywhere else in the app, rather than look-alikes assembled by hand.

The app draws from one icon set instead of two. Every icon is Untitled UI's now
and `lucide-react` is gone, so the chrome and the components it sits beside are
drawn by the same hand. Icons look slightly different as a result — a different
grid and a different weight — and two of them changed on purpose: the **View**
button wears sliders rather than a gear, and **Browse** is a navigational
compass rather than a drafting one.

Buttons that only looked like buttons are buttons. Ten of them — in Settings,
the sidebar, the import screen and the collection toolbar — were plain elements
painted to match; they are the real component now, which is what makes them
behave the same everywhere for a keyboard and a screen reader.

Card tags are the design system's badge, so a card takes a little less room and
rows sit closer together. A held printing is filled and a wanted one is
outlined, the same distinction as before and still readable without colour.

- Card Orb now draws from Untitled UI's full icon set, which adds filled, duocolor and duotone styles alongside the outlines it already used.

- Sharing the iPhone app's page now shows a picture and a title instead of a bare link. It had been shipping with no share image at all.
- The share cards for the privacy policy and the terms of use now carry their size and description, so chat apps and social sites draw the large version rather than a thumbnail.
- The home page's browser tab and search result now read "Card Orb — track your Pokémon card collection" instead of just "Card Orb".

**"Skip to content" now skips the navigation.** It is the first thing a keyboard
reaches on any page, and it was landing at the top of a region that still had
the sidebar and the tab bar inside it — so pressing it moved you past one bar and
then straight into the whole menu anyway. On every screen, the first thing after
it was the Card Orb link in the corner.

It now lands where the page's own content starts: the search field on your
collection, the first line of a legal page, the first link on the home page.

Nothing looks different. A skip link is invisible until you focus it, which is
why this went unnoticed for as long as it did.

- Active items in the sidebar and the mobile tab bar now use properly drawn solid icons instead of outline icons with their fill turned on.

The last eight buttons that only looked like buttons are buttons. The **Filter**
and **View** controls on a phone, the Cancel, Apply and Done inside those sheets,
the arrows either side of a card on a shared collection link, and the avatar's
**Upload** — all were plain elements painted to match. They are the real
component now, so they focus, disable and respond the same way as every other
button in the app.

Almost nothing changes on screen. **Filter**, **View** and the avatar's button
are four pixels wider, because they now carry the same spacing around their
label as every other button that has one. The only other difference shows while
an avatar is uploading: that button fades by the same amount as anything else
unavailable, rather than by its own slightly different one.

Nothing on screen changes with this one. It is the scaffolding underneath: the
design system's button styling is now read from the component that defines it
rather than kept as a second copy, the code that ships with the design system is
type-checked instead of exempted, and the screenshot tests can no longer report
themselves green without actually comparing anything.

That last one had been hiding a real fault in code that had never been checked —
an import of a package the project does not have. It is fixed.

- On a tablet-sized screen the collection's toolbar wraps again: the search field takes its own row and View and Filter sit under it, instead of four controls squeezing onto one line.

- Three empty messages — the sets list, the set browser, and a set you have every card of — were rendering as unstyled text. They are proper empty states again, with an icon and a line explaining what to do.
- The number of active filters beside the Filter button was showing as bare text instead of a badge. It is a badge again.
- Filter and View open as proper panels now: they close on Escape and on a click outside, and they hand focus back to the button you opened them from.
- The switches, the segmented rows and every text field are built from the shared component set. The chosen option in a segmented row is filled in rather than tinted, so it is legible at a glance.
- The "Add a card" button now shows its label when you reach it with the keyboard, not only when you point at it with a mouse.

- The value chart now has a tooltip: point at the line and it says what the collection was worth on that date.
- Avatars, checkboxes, the priciest-cards table and the appearance picker are built from the shared component set, so they behave the same everywhere — the appearance picker answers to the arrow keys for the first time.

## 2026-08-19

- The mark panels and colour swatches on `/brand` have their rounded corners
  back. They were drawn square, because both read a design token that has never
  existed and a missing token fails silently.
- Body paragraphs on the landing page and the iPhone app page are set a little
  more openly: `leading-relaxed` now means what the design system's own token
  has always said it means, rather than a slightly tighter value it picked up by
  accident.

- Buttons, the active tab and every other "this is the main thing" surface are now Card Orb blue instead of near-black, so the accent means one thing throughout the app.

- The tickboxes in the filter and view menus match the rest of the app now, and the search field looks like the buttons beside it.

- Card Orb's accent colour is now Untitled UI's, so buttons, the active tab and every highlighted surface changed from blue to purple.

- Settings uses the same panels, fields and switches as the rest of the app — one look throughout instead of a page with its own.

- Cards across the app — the dashboard tiles, the value chart, the landing page's feature grid — sit on a plain white surface with a soft edge instead of the frosted-glass panel.

- The bar along the bottom on a phone is built from the same surface and type as the rest of the app now. It works exactly as it did.

- Sign-up, password reset and the welcome flow use the same rebuilt fields as sign-in: labels tied to their input, hints that screen readers announce, and a reveal toggle on every password box.

- The sign-in screen's fields and button are rebuilt on Untitled UI. The password box now has a reveal toggle, so you can check what you typed, and the sign-in button's blue is a shade deeper — the old one put white text at 4.02:1, under the 4.5:1 that small text needs to stay readable.

## 2026-08-17

- Nothing visible changed: twelve classes moved from a stylesheet into the
  components that use them, verified pixel-identical at three widths.

- Signed in, the public pages' navbar shows you as a pill: your avatar and your name inside a light grey rounded button, where it used to read "Signed in as {name}" as a bare line of text. It still goes to the dashboard, and a screen reader still hears "Signed in as {name} — open dashboard". A long display name now ellipsizes inside the pill instead of pushing the wordmark onto two lines on a phone. One component (`app/components/ViewerPill.tsx`) for both `/` and `/app/ios`, which had a copy each.

## 2026-08-16

- Add a card: when the card search can't reach pokemontcg.io, the dialog now says "Search is temporarily unavailable" with a "Try again" button, instead of silently showing no results. A "Show more results" button also appears under broad searches (like a common Pokémon name) instead of stopping at 20.

- Add a card: the search bar's placeholder now says "Search for a card" instead of a list of example queries.

- Browse every set there is, not just the ones you own from. A new **Browse** screen (`/collection/browse`) lists all 174 sets in the catalogue with a search box and how far into each one you are, and opening a set shows every card in it — the ones you have at full strength, the ones you don't dimmed, with an Add button that opens the add dialog already filled in. You can narrow a set to just yours or just what's missing.
- The card search in the add dialog now shows which results you already have, so a second copy is a choice rather than an accident.
- Set pages load about seven times lighter than they first did: card pictures come from TCGdex's WebP where it has them (26 kB) instead of pokemontcg.io's PNG (198 kB), which takes a full 207-card set from roughly 40 MB down to 5 MB.
- New API endpoints for the iOS app: `GET /api/v1/catalog/sets` (every set with your own counts) and `GET /api/v1/catalog/sets/:setId` (a whole set, paged, with `owned`, `wishlist` and `quantity` on each card). Both need a signed-in session or a bearer token, like the existing card search.

- Fixed 21 cards in the collection that were filed under the wrong number or a scrambled name — mostly Trainer Gallery cards, where the numbering had several of them holding each other's places. Each of those cards gets its picture, its price, its own page and its place in the set back; the number is what all four are looked up by. 30 more need a person to look at the actual card (usually "is this the V or the VMAX?") and are listed in `docs/collection-audit-corrections.md`.
- Card names and rarities now say exactly what the catalogue says: 293 cards gained the printing suffix they were missing ("Pikachu" is "Pikachu ex" if that is what is printed on it), and 956 had their rarity and type brought in line. One vocabulary across the whole collection instead of two — which also means the foil effect now recognises 485 illustration rares it previously did not.

- Every collection is now named after the person it belongs to. A shared link reads "Pikachu's Pokémon card collection" for Pikachu's collection, on the page, in the browser tab, and in the preview image — it used to say "Bart's" for everybody.
- Signing up now asks for your name, optionally. Skip it and your collection is named after your username until you fill it in; Settings' "Display name" panel is now "Your name" and shows you exactly what your page will be called.
- Fixed: opening a card from somebody else's public collection answered "no such collection". Only the first account's cards could be opened this way.
- The sitemap now lists every collection that has been made public, instead of only the first one.

- Every card now knows which printing your copy is, worked out from the
  catalogue: 1,904 of 1,968 rows, with 21 left for a human. A reverse holo is
  valued at the reverse holo price, and a card that only ever existed as a holo
  keeps its own.

- A page for the iPhone app, at `/app/ios`. What it is, what it does, what it looks like, and what you need for it — reachable from the landing page's hero badge, its navigation and the footer. `/app` sends you there too.
- The download button on it is deliberately not pressable yet: the app is not on the App Store, and rather than a dead link or a greyed-out mystery it says so in a line underneath. It stays reachable by keyboard so it can explain itself.
- No release date is claimed anywhere on the page, and the screenshots are visibly empty slots until there are real ones to put in them.

- The loading state no longer draws a page that does not exist. While a signed-in screen is on its way you now see the sidebar, the bottom bar and an outline where the heading lands — instead of a toolbar, two set panels and twenty card outlines under a heading reading "Cards", which is what it showed on the dashboard, on settings and everywhere else.
- The bottom bar no longer changes height when a screen finishes loading, and the sidebar's rows no longer jump: its wordmark row and the account button at the bottom are part of the loading state now, so nothing shifts on arrival.
- On a narrow window the bottom bar's outer slots no longer hang outside the bar while a screen is loading; the slots divide the space that is actually there.

- Your dashboard now shows which cards went up and which went down, so the value
  chart's line can be attributed to actual cards. It needs two weekly readings
  before it appears, so it starts showing up about a month after this ships.

- The landing page no longer talks about a demo collection: the FAQ answers questions about your own cards, "Public collections" in the header is now "Sharing", and the "1,600+ cards tracked" figure — one person's binder — is now "No limit, cards per collection".

- Card Orb has a picture of itself. The orb from the iPhone app's icon now sits next to the name in the nav bar, the sidebar and the footer, so the website and the app are recognisably the same product.
- Tabs and bookmarks show the orb instead of the browser's blank page glyph — the round one, with no box around it, since nothing rounds off a favicon for you. Saving the site to a phone's home screen gives it the app icon on its tile, which is what a home screen expects. On Android, Chrome will now offer to install it at all, which it would not do before.
- A link to Card Orb shared in a chat or on social now previews with the orb beside the headline.
- New page at `/brand`: the mark in both its versions, the colours, the rules for using it, and direct downloads. Linked from the footer.

- A card can now record which printing a copy is — normal, reverse holo or holo —
  and a reverse holo is valued at the reverse holo price, which on average is
  about twice the normal one. Nothing is set yet, so no figure changes until the
  finishes are filled in.

- There is a privacy policy now, at `cardorb.com/privacy`, covering both the website and the iPhone app. It says what is stored, why, who else sees it, and how to get rid of it — including that a public collection never shows prices or purchase details, that card scanning happens on your own device, and that deleting your account takes the whole collection with it immediately.
- Every page footer now links to it, and the signup form says so before you create an account.

- A public collection page no longer carries the owner's own inventory. What you
  paid for a card, when you bought it, its condition, its grade, your notes on it
  and how many you hold were being sent to anyone who opened your public link or
  called the public API, even though the page never showed them. Only the rarity
  and whether you own it are published now.

- Settings is one page: Profile, Account, Import and Appearance are all on screen at once, full width like the other screens, instead of four cards you had to open one at a time. Old links such as `/settings/appearance` redirect to it.
- Settings: deleting your account is now its own section at the bottom of the page, rather than a red card in the middle of the Account section.

- Your collection's value is now recorded automatically, once a week, so the
  "Value over time" chart fills in on its own. It used to need a command run by
  hand, which meant it never gained a fourth point.

- The highlight around the selected tab now sits inside the bar on every side.
  On a phone the row of tabs was wider than the bar itself, so the first and last
  tab — and the highlight behind them — hung over its left and right edge, and on
  a narrow phone off the screen entirely. Each tab is as wide as its own label
  now and gives way when there is less room, so the bar always fits, and the
  highlight resizes as it slides between tabs.

- There are terms of use now, at `cardorb.com/terms`, saying what Card Orb promises and what it does not — including, in as many words, that the prices it shows are what a market has been doing rather than a valuation of your cards, and that Card Orb is not connected to The Pokémon Company, Nintendo, Game Freak or Creatures.
- The footer links to both the terms and the privacy policy, the landing page's FAQ answers "What happens to my data?", and the signup form names both before you create an account.

- Changing your username works from a signed-in app, not only from the website. `POST /v1/username` accepted a session cookie and nothing else, so the iOS app was told "Sign in first." while holding a valid token. It now resolves the caller the same way every other write does, and claims the name on that caller's own connection — the same bearer/RLS rule as [0008](../decisions/0008-per-variant-inventory-fields-and-bearer-rls-fix.md). No visible change on the website.

- The "Value over time" chart on your dashboard is now your own collection's
  history. It used to draw the same series for every account. It stays hidden
  until your collection has been valued at least twice.
- Collection value now counts every copy you hold. A card in the binder three
  times used to be worth one of it, so the figure went up for anyone with
  duplicates. "Priciest cards" still ranks by what one copy is worth.
- `GET /api/v1/value-history` answers with the caller's own series.

- New accounts now start with a short welcome flow: pick your username and display
  name, add a picture, decide whether your collection is public, and either add a
  first card or import a spreadsheet. Every step can be skipped, and everything in
  it stays available under Settings.
- Settings > Profile now says whether a username is free while you type it, the
  same check the welcome flow makes, instead of only after pressing Save.
- An empty collection no longer says the collection is unavailable. A new account
  reads "No cards yet" with a way to add one; the outage message is kept for
  actual outages.

- The wishlist tile on your dashboard now also says what the list would cost to
  buy.
- Collection value now says where it sits against its own 30-day average, so the
  figure has some sense of scale from the first day rather than only once the
  chart has two readings.

## 2026-08-15

- Add a card: the dialog now opens on a single search bar — type a name, number, set, or type ("charizard 151" works too) and matching cards appear live; pick one to fill in Name, Number, Set, Rarity and Type. "Advanced filters" gives Name/Number/Set/Type as their own fields for a more precise search. A card must be found and picked to be added — there is no longer a way to type one in by hand.

- Opening a card from `/collection` now stays inside the app (sidebar and nav still visible) as a real page, instead of landing on the older standalone `/cards/[id]` page. The old address still works for existing links/bookmarks.

- Trainer Gallery and Galarian Gallery cards can now get their artwork from pokemontcg.io, which publishes those galleries as sets of their own addressed by the printed number. The number is checked against that set's card list before the scan is believed, so a row filed under the wrong number keeps its empty slot rather than showing a different Pokémon. Twenty-three owned gallery cards are blank for exactly that reason today; `docs/trainer-gallery-row-corrections.md` lists the row corrections that will bring their artwork, price and detail page back.

- Landing page: hero simplified to a single centred column, sign-in state now reflected in the nav ("Signed in as {name}" with an avatar), stats row and an FAQ section added, no more links to the public collection demo anywhere on the marketing pages or `/login`.
- Landing/login nav is now one shared, sticky component with a light/dark toggle in the footer instead of a floating button.
- Sidebar (`/collection/*`): shadow reduced, wordmark added to the header with the add-card button aligned opposite it (now filled black), the full set list collapsed to a single "Sets" row linking to the existing `/collection/sets` page.
- Fixed: the bottom tab bar was showing on desktop next to the sidebar instead of hiding above 1000px.

- `GET /api/v1/public/[username]/latest-pull` now only ever answers with a card that is actually owned. Wishlist rows were counted as pulls, so the endpoint was announcing a card that had never been bought — and, since a wanted card is usually a just-announced promo no catalogue has a scan for, announcing it without artwork too. The route also gained a 60/minute per-address rate limit and a preflight (`OPTIONS`) handler, and is now documented in the README for anyone embedding it on another site. No API key: it never needed one.

- Profile picture: upload one in Settings > Profile, shown next to your name wherever the app already showed "Signed in as {name}". Falls back to your initial until you set one.

- New public endpoint `GET /api/v1/public/[username]/latest-pull` returns the most recently added, non-excluded card (no price or purchase data), open cross-origin for the portfolio site. Cards marked "excluded" in the add-card dialog are left out.

- Removed the Notion integration entirely — the collection now lives only in Postgres. Settings > Import no longer offers "From Notion"; only a spreadsheet import remains.

- Removed the "Pokémon" tick-list filter from the collection's Filter menu/sheet — the search box already filters by Pokémon name, and now it's the only way to.

- Wishlist card scans no longer render dimmed and greyscale. That styling existed to tell wishlist cards apart from owned ones when both appeared mixed in the same view; the wishlist now has its own page, so the distinction is no longer needed.

- Full security review of the platform. Closed three gaps: `GET /api/v1/public/[username]/collection` now has the same per-address rate limit as `latest-pull`, the `email` and `password` account-settings endpoints now have one too, and the import-history endpoint now filters by the caller's own id in the query itself instead of relying solely on Postgres row-level security. No other issues found.

- Site-wide: one typeface (Inter) instead of Satoshi for headings and Inter for body text; the page background is now white instead of off-white in light mode.

- Sorting (By set / Priciest / Cheapest) moved from its own toolbar control into the View button, alongside Group by, Layout, Show on card and Per row. No change to what the sort options do, only where the control lives.

- Mobile tab bar: the "Settings" tab is now "You" and shows your avatar (or your initial) instead of a gear icon, and every tab is now the same width without clipping its label. Fixed the active-tab highlight and the bar itself sometimes touching the screen's edges on narrow phones instead of matching its own padding, and fixed it touching the add button directly with no gap.
- Settings now stays inside the app's sidebar/tab bar like every other screen, instead of dropping to a bare page — pressing "You" no longer feels like leaving the app.
- Dashboard and Sets now have a visible page title at the top, matching the style Collection/Wishlist/Settings already use.

- Migrated the card detail view and the "add a card" dialog (`cards.css`) to Tailwind. `CardDetail.tsx`'s `margin-top` stayed in CSS (the `.modal--card` dialog variant overrides it to 0 — the same unconditional-Tailwind-vs-conditional-CSS trap ADR-0013 already covers). `CardNav.tsx`'s prev/next buttons needed their own `flex justify-between` alongside `CardDetail.tsx`'s wrapper, since `PublicCardDialog.tsx` passes a bare fragment instead of `CardNav` and relies on the wrapper for that layout.

- Migrated the collection page's card grid, sidebar rail, and card tiles (`cards.css`) to Tailwind, keeping a handful of class names as cross-file selector hooks where other not-yet-migrated files still depend on them. Fixed a follow-on bug where an unconditional Tailwind utility on the rail/main panes beat the CSS media query that swaps between them on narrow screens. Also fixed three places (the `/cards` loading skeleton, the card detail tag, and the public-collection view's own card grid) that were still relying on CSS already deleted elsewhere for the same class names.

- Continued the Tailwind migration through the rest of `cards.css`'s toolbar and dialog chrome: the segmented-track and layout-toggle controls (new shared `trackClasses.ts`), the set index grid, the filter/view dropdown-and-sheet shells (new shared `MenuDetails.tsx` and `Sheet.tsx` components, replacing duplicated markup in `FilterMenu`/`ViewMenu`/`FilterSheet`/`ViewSheet`), the card detail/add dialog sizing (`cardModalClasses.ts`), the `/cards` loading skeleton's outline sizes, and several dead CSS rules left over from earlier passes. `cards.css` is down to 1,365 lines, holding only properties that are genuinely cross-file hooks or conditionally overridden by ancestor context (documented in ADR-0013/ADR-0015). No visual or behavioural change intended.

- Migrated the /cards dashboard (KPI tiles, priciest-cards table, era/type bar charts), the Pokédex grid, and the sign-in/appearance profile screen (`cards.css`) to Tailwind. The Pokédex's hover-reveal step arrows and hover pill moved to `group`/`after:` variants; its container-query breakpoint moved to a Tailwind `@max-[560px]:` variant. Fixed a missed consumer (per ADR-0014): `CollectionValueCard.tsx` was still using two dashboard classes already deleted from `cards.css`.

- Migrated the active-filters chip row (`FilterChips.tsx`) and the collection value chart's SVG (`CollectionValueCard.tsx`) to Tailwind, and dropped an orphan `cards-value` class with no matching CSS rule. `Segmented.tsx`'s `.cards-segmented`/`.cards-segment` stay CSS for now: they're shared with `FilterOptions.tsx` and `ViewOptions.tsx`, both deferred pending the variant-prop redesign noted earlier in the migration.

- Fixed a real regression from an earlier migration pass: the Add Card dialog's inputs had lost their glass-control styling (border, background, height, focus ring) entirely, because the CSS class they read no longer existed anywhere in the DOM. Restored as Tailwind classes on `CardAddDialog.tsx`.
- Deleted `form.css` (fully redundant after the fix above) and `tokens.css`'s dead `.sr-only` rule (a byte-for-byte duplicate of Tailwind's own built-in utility). Migrated `.skip-link` to Tailwind classes in `app/layout.tsx`.

- Migrated the landing page (`landing.css`, 692 lines, single consumer `app/page.tsx`) to Tailwind utility classes and deleted the file. No visual or behavioural change intended.

- Rarity and type are no longer typed by hand: in the add-card dialog's catalogue search, picking a result now shows rarity and type as read-only facts rather than an editable field/chips. The existing collection (978 rows) has been backfilled from TCGdex the same way; 22 rows it couldn't confidently match are listed in `docs/rarity-type-backfill-corrections.md` for manual review. One trade-off: rarity used to double as which foil variant a printing was (non-holo/holo/reversed holo); neither catalogue has such a field, so that fact is no longer tracked — the card foil effect now keys off the catalogue's own rarity tier instead.

## 2026-08-14

- Signup no longer asks for a username — a friendly one is generated automatically, and you can pick your own later from Settings.

- Fixed every Postgres-backed account being unable to read its own collection or add a card through the API when authenticated by bearer token (the iOS app, curl) — row level security was correctly refusing a client that never carried the caller's session.
- Fixed account sign-up failing for any client that doesn't send a username at sign-up (the iOS app included) — the server-side fallback username was too long for its own constraint.
- Added quantity, condition, grade, purchase price, purchase date, notes and a favourite flag to each printing in the collection, with `PATCH`/`DELETE /api/v1/collection/items/{id}` to edit or remove one.
- Added `GET /api/v1/catalog/search?set=&query=` to find a card by name within a chosen set.
- `PATCH /api/v1/profile` and `GET /api/v1/profile` now accept a bearer token, not just a browser session.

- Rebuilt the public homepage as a premium product landing page with a static public-collection preview.
- Clarified that Card Orb is completely free and surfaced Cardmarket prices in euros as collector context.

- Migrated html/body base styling, the card surface, and the tag chip to Tailwind. Fixed a regression from an earlier pass where login/signup form fields had lost their border and background styling. Removed two unused CSS animations. No other visual change intended.

- Fixed a cascade-layers bug from the Tailwind migration where padding/margin utility classes were silently overridden by legacy CSS on every migrated component (spacing that used `gap` was unaffected, which is why it wasn't visible in screenshots). Migrated the outermost `/cards` and public-collection page shell to Tailwind.

- Migrated the login, signup, forgotten-password, set-password and profile sign-in forms from hand-written CSS to Tailwind (shared `FormField`/`SigninShell` components). Fixed a pre-existing bug where the 404 page's description text had no styling. No other visual change intended.

- Migrated the settings screens and the shared dialog shell (Modal) from hand-written CSS to Tailwind. No visual change intended.

- Started migrating hand-written CSS to Tailwind: Tailwind utilities are now available on every route (previously only the collection views), and the error-page and about-card styling now ship as Tailwind classes instead of separate stylesheets. No visual change intended.

- Migrated the floating tab bar and its mobile layout rules from hand-written CSS to Tailwind. No visual change intended.
