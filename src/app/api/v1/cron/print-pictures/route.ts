import { NextResponse } from "next/server";
import { apiError, refuse } from "@/lib/api/respond";
import { canStoreImages, isOurs, keepImage } from "@/lib/core/catalogue/image-store";
import {
  type PrintProduct,
  englishPrintProducts,
  japanesePrintProducts,
  productPicture,
} from "@/lib/core/catalogue/print-pictures";
import { groupProducts, japanGroups } from "@/lib/core/catalogue/tcgplayer-japan";
import TCGPLAYER_IDS_JA from "@/lib/core/tcgplayer-ids.ja.generated.json";
import { mapLimit } from "@/lib/core/util";
import {
  type CatalogueLanguage,
  type PrintPictureRow,
  listCatalogueProducts,
  listPrintPictureProducts,
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
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    console.error("[cron] CRON_SECRET is not set: refusing to copy the printings' pictures");
    return apiError(503, "Not configured.");
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return apiError(401, "No.");
  }
  const db = adminClient();
  if (!db) return refuse("noDatabase");
  if (!(await canStoreImages())) return refuse("catalogue");

  const start = performance.now();
  const report = { en: 0, ja: 0, candidates: 0, missing: 0, groups: 0, answered: 0, ms: 0 };

  const [heldEn, heldJa, copiedJa] = await Promise.all([
    listPrintPictureProducts(db, "en"),
    listPrintPictureProducts(db, "ja"),
    listCatalogueProducts(db, "ja"),
  ]);

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

  const todo: { language: CatalogueLanguage; product: PrintProduct }[] = [
    ...englishPrintProducts()
      .filter((p) => !heldEn.has(p.productId))
      .map((product) => ({ language: "en" as const, product })),
    ...japanese
      .filter((p) => !heldJa.has(p.productId))
      .map((product) => ({ language: "ja" as const, product })),
  ];
  report.candidates = todo.length;

  const rows: PrintPictureRow[] = [];
  await mapLimit(todo, 8, async ({ language, product }) => {
    if (performance.now() - start > BUDGET_MS) return;
    const source = productPicture(product.productId);
    const kept = await keepImage(source);
    if (!isOurs(kept)) {
      report.missing++;
      return;
    }
    rows.push({
      language,
      card_id: product.cardId,
      print: product.print,
      product_id: product.productId,
      image: kept,
    });
    report[language]++;
  });

  try {
    await writePrintPictures(db, rows);
  } catch (err) {
    console.error("[cron] writing the printings' pictures failed:", err);
    return NextResponse.json({ ok: false, ...report }, { status: 500 });
  }
  report.ms = Math.round(performance.now() - start);
  console.log(
    `[cron] print pictures: ${report.en} English and ${report.ja} Japanese copied of ` +
      `${report.candidates}, ${report.missing} without a photo, ${report.answered}/${report.groups} groups, ${report.ms} ms`,
  );
  return NextResponse.json({ ok: true, ...report });
}
