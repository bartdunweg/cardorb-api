/**
 * The Cardmarket product id of every card on the Japanese, Korean and Chinese shelves.
 *
 *   node scripts/language-cardmarket-ids.mjs            # every catalogue, print what it found
 *   node scripts/language-cardmarket-ids.mjs --write    # write the maps
 *   node scripts/language-cardmarket-ids.mjs --write ja # one catalogue
 *
 * ── Why this exists ──
 *
 * A set page prices its cards from Cardmarket's daily guide, through a committed map from the
 * catalogue's own id to Cardmarket's product id (cardmarket-ids.generated.json). That map holds
 * English cards somebody owns, so a Japanese set page showed a blank line under all 92 cards —
 * not because nobody prices them, but because nothing here knew which product they are. Every
 * one of M1S's 92 cards is in the guide the API already downloads once a day.
 *
 * TCGdex carries the link, on the card and nowhere else: the set list gives an id, a number and
 * a name, and the product id only appears when the card itself is asked for. So it is asked
 * for, once per card, here rather than on the page — 21,333 requests is a script that runs for
 * half an hour, not a page anybody can wait for.
 *
 * One file per catalogue, because the ids are not unique between them: SM1S is a set in both
 * Japanese and Korean, and SM1S-001 is a different card in each.
 *
 * Re-runnable. What is already mapped is kept, so a second run only asks about cards added
 * since the first, and a run that dies halfway loses nothing. Run it when a set is added.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "lib", "core");
const HOST = "https://api.tcgdex.net/v2";
const LANGUAGES = ["ja", "zh-tw", "zh-cn", "ko"];

const args = process.argv.slice(2);
const write = args.includes("--write");
const only = args.filter((a) => !a.startsWith("--"));
const languages = only.length ? LANGUAGES.filter((l) => only.includes(l)) : LANGUAGES;

const file = (lang) => join(ROOT, `cardmarket-ids.${lang}.generated.json`);

/** One GET, with a retry: a catalogue that refuses once under load answers the second time. */
async function json(url) {
  for (let tries = 0; tries < 3; tries++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "cardorb.com" } });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`${res.status}`);
      return await res.json();
    } catch (err) {
      if (tries === 2) throw new Error(`${url}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 500 * (tries + 1)));
    }
  }
}

/** Eight at a time: the number the API's own catalogue reads use, and TCGdex tolerates it. */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (let i = next++; i < items.length; i = next++) out[i] = await fn(items[i], i);
    }),
  );
  return out;
}

for (const lang of languages) {
  const known = existsSync(file(lang)) ? JSON.parse(readFileSync(file(lang), "utf8")) : {};
  const sets = (await json(`${HOST}/${lang}/sets`)) ?? [];

  // The set list names every set the catalogue has; most of the older ones carry no cards at
  // all (68 of 184 Japanese sets, 92 of 95 Korean ones). Those cost one request and no more.
  const details = await mapLimit(sets, 8, (s) => json(`${HOST}/${lang}/sets/${s.id}`));
  const ids = details.flatMap((d) => (d?.cards ?? []).map((c) => c.id));
  const wanted = ids.filter((id) => !(id in known));

  process.stdout.write(
    `${lang}: ${sets.length} sets, ${ids.length} cards, ${wanted.length} to ask about… `,
  );

  let found = 0;
  let asked = 0;
  await mapLimit(wanted, 8, async (id) => {
    const card = await json(`${HOST}/${lang}/cards/${encodeURIComponent(id)}`);
    // The product id, not the price: prices change every night and the guide already has them.
    // Null where Cardmarket has no product for the card — a fact worth keeping, so the next run
    // does not ask again. Chinese and Korean cards are mostly this.
    const product = card?.pricing?.cardmarket?.idProduct ?? null;
    known[id] = product;
    if (product != null) found++;
    if (++asked % 500 === 0) process.stdout.write(`${asked}… `);
  });

  const linked = Object.values(known).filter((p) => p != null).length;
  console.log(`${found} new, ${linked} of ${Object.keys(known).length} linked.`);
  if (write) {
    // Sorted, so a re-run's diff is the cards that were added and nothing else.
    const sorted = Object.fromEntries(
      Object.keys(known)
        .sort()
        .map((k) => [k, known[k]]),
    );
    writeFileSync(file(lang), `${JSON.stringify(sorted, null, 2)}\n`);
  }
}

if (!write) console.log("\nNothing written. Re-run with --write.");
