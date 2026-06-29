import "dotenv/config";
import { prisma } from "../src/lib/db";
import { getMarketWithGrouping } from "../src/lib/polymarket";

/**
 * One-time (re-runnable) backfill: fills series/event/tag grouping for bookmarks
 * created before grouping existed. Re-fetches each from Gamma. Safe to re-run —
 * only touches rows still missing all grouping fields.
 */
async function main() {
  const rows = await prisma.bookmark.findMany({
    where: { seriesId: null, eventSlug: null, pmTags: null },
    select: { id: true, marketId: true, question: true },
  });
  console.log(`Backfilling ${rows.length} bookmark(s)…`);

  let updated = 0;
  let failed = 0;
  for (const bm of rows) {
    try {
      const market = await getMarketWithGrouping(bm.marketId);
      if (!market?.grouping) {
        failed += 1;
        console.log(`  skip  ${bm.question.slice(0, 50)} (no grouping returned)`);
        continue;
      }
      const g = market.grouping;
      await prisma.bookmark.update({
        where: { id: bm.id },
        data: {
          seriesId: g.seriesId,
          seriesTitle: g.seriesTitle,
          seriesRecurrence: g.seriesRecurrence,
          eventSlug: g.eventSlug,
          eventTitle: g.eventTitle,
          pmTags: JSON.stringify(g.tags),
        },
      });
      updated += 1;
      console.log(
        `  ok    ${bm.question.slice(0, 50)} → series=${g.seriesTitle ?? "—"} tags=${g.tags.length}`,
      );
    } catch (e) {
      failed += 1;
      console.log(`  fail  ${bm.question.slice(0, 50)} (${(e as Error).message.slice(0, 60)})`);
    }
  }
  console.log(`Done. updated=${updated} failed=${failed}`);
  process.exit(0);
}

main().catch((e) => {
  console.error("ERR:", e.message);
  process.exit(1);
});
