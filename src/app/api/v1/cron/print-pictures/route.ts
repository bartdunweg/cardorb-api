import { NextResponse } from "next/server";
import { refuseCron } from "@/lib/api/cron";
import { refuse } from "@/lib/api/respond";
import { TCGDEX_SCAN_PRINT } from "@/lib/core/catalogue/artwork";
import {
  IMAGES_ORIGIN,
  canStoreImages,
  imageKey,
  isOurs,
  keepImage,
} from "@/lib/core/catalogue/image-store";
import {
  englishPrintProducts,
  japanesePrintProducts,
  productPicture,
  tcgdexPrintScans,
} from "@/lib/core/catalogue/print-pictures";
import { json } from "@/lib/core/catalogue/tcgdex-client";
import { groupProducts, japanGroups } from "@/lib/core/catalogue/tcgplayer-japan";
import TCGPLAYER_IDS_JA from "@/lib/core/tcgplayer-ids.ja.generated.json";
import { mapLimit } from "@/lib/core/util";
import {
  type CatalogueLanguage,
  type PrintPictureRow,
  catalogueSetVariants,
  listCatalogueProducts,
  listPrintPictures,
  writePrintPictures,
} from "@/lib/storage/postgres";
import { adminClient } from "@/lib/storage/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Copying stops starting new pictures here, so the last writes land inside maxDuration. */
const BUDGET_MS = 240_000;

/**
 * The printings' pictures, once a night: every TCGplayer product that is a printing of a card
 * (print-pictures.ts), its photo copied into our bucket and its address written to
 * card_print_pictures.
 *
 * A product the table already names is not asked again, so after the first nights a run reads the
 * Japanese shelf's 459 product files and copies only what is new. A first pass is some 2,900
 * photos; what the budget does not reach tonight is copied the next night. A photo TCGplayer does
 * not have (its address answers 403) is no row, and is asked again the next night.
 *
 * Same bearer as the other crons: `CRON_SECRET`.
 */
export async function GET(req: Request) {
  const denied = refuseCron(req, "copy the printings' pictures");
  if (denied) return denied;
  const db = adminClient();
  if (!db) return refuse("noDatabase");
  if (!(await canStoreImages())) return refuse("catalogue");

  const start = performance.now();
  const report = {
    en: 0,
    ja: 0,
    tcgdex: 0,
    proven: 0,
    candidates: 0,
    missing: 0,
    groups: 0,
    answered: 0,
    ms: 0,
  };

  const [heldEn, heldJa, copiedJa] = await Promise.all([
    listPrintPictures(db, "en"),
    listPrintPictures(db, "ja"),
    listCatalogueProducts(db, "ja"),
  ]);
  const heldProducts = new Set(heldEn.flatMap((r) => (r.product_id == null ? [] : [r.product_id])));
  const heldJaImage = new Map(heldJa.map((r) => [`${r.card_id}|${r.print}`, r.image]));
  const heldJaProduct = new Map(heldJa.map((r) => [`${r.card_id}|${r.print}`, r.product_id]));

  // The Japanese cards by their plain product: the committed map, and what the copy matched.
  const cardOf = new Map<number, string>();
  for (const [id, productId] of Object.entries(TCGPLAYER_IDS_JA as Record<string, number | null>))
    if (productId != null) cardOf.set(productId, id);
  for (const [id, productId] of copiedJa) if (!cardOf.has(productId)) cardOf.set(productId, id);

  const groups = await japanGroups().catch(() => []);
  report.groups = groups.length;
  const japanese = (
    await mapLimit(groups, 8, async (g) => {
      const products = await groupProducts(g.groupId).catch(() => null);
      if (!products) return [];
      report.answered++;
      return japanesePrintProducts(products, cardOf);
    })
  ).flat();

  /* TCGdex's scans of a set it photographed as one printing (artwork.ts, TCGDEX_SCAN_PRINT): the
     printing's picture before TCGplayer's product photo, being a scan of the card and not a photo
     of a listing. One TCGdex read and one copy read per such set. A set that does not answer is
     tried the next night; TCGplayer's photo stands for it meanwhile. */
  const scans = (
    await Promise.all(
      Object.entries(TCGDEX_SCAN_PRINT).map(async ([setId, print]) => {
        try {
          const [set, variants] = await Promise.all([
            json(`https://api.tcgdex.net/v2/ja/sets/${setId}`, `ja set ${setId}`) as Promise<{
              cards?: { id: string; image?: string | null }[];
            }>,
            catalogueSetVariants(db, setId, "ja"),
          ]);
          return tcgdexPrintScans(set.cards ?? [], print, variants);
        } catch (err) {
          console.error(`[cron] print pictures: TCGdex's ${setId} could not be read:`, err);
          return [];
        }
      }),
    )
  ).flat();
  const scanned = new Set(scans.map((s) => `${s.cardId}|${s.print}`));

  type Job = {
    language: CatalogueLanguage;
    cardId: string;
    print: string;
    productId: number | null;
    /** A file, or a TCGdex folder whose `high.webp` is the picture. */
    source: string;
    /** False for a product TCGplayer holds no picture of: a row that proves the printing, no copy. */
    pictured?: boolean;
    /** A TCGdex folder, copied as two files. */
    folder?: boolean;
  };
  /* The TCGplayer product of each Japanese printing, so a TCGdex scan's row keeps it: the price of
     that printing is read by the product (collection.ts japaneseFinishPrintingsFor), and a scan row
     without one left 151's Poké Ball reverses unpriced (2026-09-15). */
  const productOfPrint = new Map(japanese.map((p) => [`${p.cardId}|${p.print}`, p.productId]));
  const todo: Job[] = [
    ...scans
      /* Held already as this very scan, with its product where TCGplayer sells one: nothing to do.
         Held as TCGplayer's photo, or without the product: written again. */
      .filter((s) => {
        const at = `${s.cardId}|${s.print}`;
        return (
          heldJaImage.get(at) !== `${IMAGES_ORIGIN}/${imageKey(s.folder)}/high.webp` ||
          (heldJaProduct.get(at) ?? null) !== (productOfPrint.get(at) ?? null)
        );
      })
      .map((s) => ({
        language: "ja" as const,
        ...s,
        productId: productOfPrint.get(`${s.cardId}|${s.print}`) ?? null,
        source: s.folder,
        folder: true,
      })),
    ...englishPrintProducts()
      .filter((p) => !heldProducts.has(p.productId))
      .map((p) => ({ language: "en" as const, ...p, source: productPicture(p.productId) })),
    ...japanese
      .filter((p) => {
        const key = `${p.cardId}|${p.print}`;
        if (scanned.has(key)) return false;
        // Held with a picture: done. Held without one: asked again only once TCGplayer has one.
        return !heldJaImage.has(key) || (heldJaImage.get(key) == null && p.pictured !== false);
      })
      .map((p) => ({ language: "ja" as const, ...p, source: productPicture(p.productId) })),
  ];
  report.candidates = todo.length;

  const rows: PrintPictureRow[] = [];
  await mapLimit(todo, 8, async (job) => {
    if (performance.now() - start > BUDGET_MS) return;
    /* A Japanese product TCGplayer holds no picture of still proves its printing (withProvenPrintings):
       its row has no image, and nothing is copied. */
    if (job.pictured === false) {
      rows.push({
        language: job.language,
        card_id: job.cardId,
        print: job.print,
        product_id: job.productId,
        image: null,
      });
      report.proven++;
      return;
    }
    const kept = await keepImage(job.source);
    if (!isOurs(kept)) {
      report.missing++;
      return;
    }
    const folder = job.folder === true;
    rows.push({
      language: job.language,
      card_id: job.cardId,
      print: job.print,
      product_id: job.productId,
      // A copied TCGdex folder is two files; the sheet shows the large one.
      image: folder ? `${kept}/high.webp` : kept,
    });
    report[folder ? "tcgdex" : job.language]++;
  });

  try {
    await writePrintPictures(db, rows);
  } catch (err) {
    console.error("[cron] writing the printings' pictures failed:", err);
    return NextResponse.json({ ok: false, ...report }, { status: 500 });
  }
  report.ms = Math.round(performance.now() - start);
  console.log(
    `[cron] print pictures: ${report.en} English, ${report.ja} Japanese and ${report.tcgdex} TCGdex copied, ${report.proven} proven without one, of ` +
      `${report.candidates}, ${report.missing} without a photo, ${report.answered}/${report.groups} groups, ${report.ms} ms`,
  );
  return NextResponse.json({ ok: true, ...report });
}
