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
