/**
 * Holds the line on cards with no TCGplayer product, offline, for verify.sh.
 *
 * A card with no product has no price anywhere in the app, and nothing on screen says why. They
 * used to be found by the owner opening TCGplayer himself (Jirachi XY67a, 2026-09-12). So
 * tcgplayer-links.mjs writes how many cards it could not link, outside the digital Pokémon TCG
 * Pocket sets, and this recounts the committed map against that number.
 *
 * It fails when the map holds more unlinked cards than the last links run left: a new set added
 * to tcgplayer-ids.generated.json (backfill-card-prices.mjs asks TCGdex for new cards) that nobody
 * has run the linker over. The fix is to run it: `node scripts/tcgplayer-links.mjs`, then commit
 * both files. Fewer is fine and says so, so the number can be brought down in the same commit.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const ids = JSON.parse(
  readFileSync(join(ROOT, "src", "lib", "core", "tcgplayer-ids.generated.json"), "utf8"),
);
const coverage = JSON.parse(readFileSync(join(ROOT, "scripts", "tcgplayer-coverage.json"), "utf8"));
const digital = new Set(coverage.digitalSets);

const unlinked = Object.keys(ids).filter(
  (id) => ids[id] === null && !digital.has(id.slice(0, id.lastIndexOf("-"))),
);

if (unlinked.length > coverage.unlinked) {
  const sets = [...new Set(unlinked.map((id) => id.slice(0, id.lastIndexOf("-"))))].filter(
    (set) => !(set in coverage.sets),
  );
  console.error(
    `${unlinked.length} cards have no TCGplayer product, ${unlinked.length - coverage.unlinked} more than the last links run left.`,
  );
  if (sets.length)
    console.error(`Sets the last links run did not see: ${sets.slice(0, 10).join(", ")}`);
  console.error(
    "Run: node scripts/tcgplayer-links.mjs, and commit tcgplayer-ids.generated.json and tcgplayer-coverage.json.",
  );
  process.exit(1);
}
console.log(
  `${unlinked.length} cards without a TCGplayer product (the last links run left ${coverage.unlinked}).`,
);
