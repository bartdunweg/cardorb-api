#!/usr/bin/env node
/**
 * Copies a list of card pictures into the cardorb-images bucket, for the first fill.
 *
 * The nightly catalogue copy keeps the bucket current once it is full (image-store.ts), but it
 * asks set by set inside a 45 second budget, and the first pass is some 40,000 files. This does
 * that pass from a machine with time: every address in a JSON list, eight at a time, through the
 * images Worker, writing each finished key to a log so a stopped run picks up where it was.
 *
 *   IMAGES_WRITE_SECRET=... node scripts/copy-images-to-bucket.mjs images.json done.log
 *
 * The list is `select json_agg(image) from catalogue_cards where image is not null`. A TCGdex
 * folder is two files (low.webp, high.webp); every other address is one. The keys are the ones
 * image-store.ts builds, and this has to agree with it: see imageKey() there.
 *
 * It PUTs without asking first. A Worker on the free plan answers 100,000 requests a day, and a
 * HEAD before every PUT would double the count for a bucket that starts empty; a PUT of a file
 * that is there already only writes it again. The log is what saves the repeat.
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";

const WRITER = "https://cardorb-images-writer.bart-dunweg.workers.dev";
const TYPE_OF = { webp: "image/webp", png: "image/png", jpg: "image/jpeg" };

const [listPath, logPath = "copy-images.log"] = process.argv.slice(2);
const secret = process.env.IMAGES_WRITE_SECRET?.trim();
if (!listPath || !secret) {
  console.error(
    "usage: IMAGES_WRITE_SECRET=... node scripts/copy-images-to-bucket.mjs <list.json> [done.log]",
  );
  process.exit(2);
}

/** image-store.ts imageKey(), for the hosts the catalogue copy holds. */
function imageKey(address) {
  if (address.startsWith("/api/cover?url=")) {
    return imageKey(decodeURIComponent(address.slice("/api/cover?url=".length)));
  }
  const url = new URL(address);
  const path = url.pathname.replace(/^\/+/, "");
  if (url.hostname === "assets.tcgdex.net") return path;
  if (url.hostname === "images.pokemontcg.io") return `pokemontcg/${path}`;
  if (url.hostname === "limitlesstcg.nyc3.cdn.digitaloceanspaces.com") return `limitless/${path}`;
  const product = /^product\/(\d+)_/.exec(path)?.[1];
  if (url.hostname === "tcgplayer-cdn.tcgplayer.com" && product) return `tcgplayer/${product}.jpg`;
  return null;
}

/** Every file one address stands for: [source, key]. */
function filesOf(address) {
  const key = imageKey(address);
  if (!key) return [];
  const source = address.startsWith("/api/cover?url=")
    ? decodeURIComponent(address.slice("/api/cover?url=".length))
    : address;
  return /\.(webp|png|jpe?g)$/i.test(key)
    ? [[source, key]]
    : [
        [`${source}/low.webp`, `${key}/low.webp`],
        [`${source}/high.webp`, `${key}/high.webp`],
      ];
}

const done = new Set(
  existsSync(logPath) ? readFileSync(logPath, "utf8").split("\n").filter(Boolean) : [],
);
const files = JSON.parse(readFileSync(listPath, "utf8"))
  .flatMap(filesOf)
  .filter(([, key]) => !done.has(key));
console.log(`${files.length} files to copy, ${done.size} done before`);

const counts = { copied: 0, missing: 0, failed: 0 };
async function copy([source, key]) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const file = await fetch(source, { signal: AbortSignal.timeout(30_000) });
      if (file.status === 404) {
        counts.missing++;
        return;
      }
      if (!file.ok) throw new Error(`source ${file.status}`);
      const bytes = await file.arrayBuffer();
      const put = await fetch(`${WRITER}/${key.split("/").map(encodeURIComponent).join("/")}`, {
        method: "PUT",
        headers: {
          authorization: `Bearer ${secret}`,
          "content-type": TYPE_OF[key.slice(key.lastIndexOf(".") + 1).toLowerCase()],
        },
        body: bytes,
        signal: AbortSignal.timeout(30_000),
      });
      if (put.status !== 201) throw new Error(`writer ${put.status}`);
      appendFileSync(logPath, `${key}\n`);
      counts.copied++;
      return;
    } catch (err) {
      if (attempt === 3) {
        counts.failed++;
        console.error(`${key}: ${err instanceof Error ? err.message : err}`);
      } else await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

let next = 0;
const started = Date.now();
await Promise.all(
  Array.from({ length: 8 }, async () => {
    while (next < files.length) {
      const i = next++;
      await copy(files[i]);
      if (i % 1000 === 999) {
        const s = Math.round((Date.now() - started) / 1000);
        console.log(`${i + 1}/${files.length} after ${s} s`, counts);
      }
    }
  }),
);
console.log("finished", counts);
