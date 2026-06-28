"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getMarket, parseSlug, resolveSlugToMarkets, type Market } from "@/lib/polymarket";

/** Bookmark a market (idempotent on marketId). Also records an initial snapshot. */
export async function addBookmark(market: Market) {
  const bookmark = await prisma.bookmark.upsert({
    where: { marketId: market.id },
    update: {
      question: market.question,
      slug: market.slug,
      pmCategory: market.category,
      endDate: market.endDate ? new Date(market.endDate) : null,
      outcomes: JSON.stringify(market.outcomes),
      closed: market.closed,
    },
    create: {
      marketId: market.id,
      question: market.question,
      slug: market.slug,
      pmCategory: market.category,
      endDate: market.endDate ? new Date(market.endDate) : null,
      outcomes: JSON.stringify(market.outcomes),
      closed: market.closed,
    },
  });

  // Seed price history so move-detection has a baseline immediately.
  if (market.outcomes.length) {
    await prisma.priceSnapshot.createMany({
      data: market.outcomes.map((o) => ({
        bookmarkId: bookmark.id,
        outcome: o.name,
        price: o.price,
      })),
    });
  }

  revalidatePath("/");
  revalidatePath("/search");
  return bookmark.id;
}

export async function removeBookmark(bookmarkId: string) {
  await prisma.bookmark.delete({ where: { id: bookmarkId } });
  revalidatePath("/");
}

export async function createCategory(name: string, color?: string) {
  const trimmed = name.trim();
  if (!trimmed) return;
  await prisma.category.upsert({
    where: { name: trimmed },
    update: {},
    create: { name: trimmed, color: color ?? null },
  });
  revalidatePath("/");
}

/** Toggle a category on a bookmark. */
export async function toggleBookmarkCategory(bookmarkId: string, categoryId: string) {
  const existing = await prisma.bookmarkTag.findUnique({
    where: { bookmarkId_categoryId: { bookmarkId, categoryId } },
  });
  if (existing) {
    await prisma.bookmarkTag.delete({
      where: { bookmarkId_categoryId: { bookmarkId, categoryId } },
    });
  } else {
    await prisma.bookmarkTag.create({ data: { bookmarkId, categoryId } });
  }
  revalidatePath("/");
}

/**
 * Set a per-bookmark alert rule. `type` is "price" | "deadline" | "news".
 * threshold: price = probability move (e.g. 0.05); deadline = hours-before-close.
 */
export async function setAlertRule(
  bookmarkId: string,
  type: "price" | "deadline" | "news",
  opts: { threshold?: number | null; enabled?: boolean },
) {
  await prisma.alertRule.upsert({
    where: { bookmarkId_type: { bookmarkId, type } },
    update: { threshold: opts.threshold, enabled: opts.enabled },
    create: {
      bookmarkId,
      type,
      threshold: opts.threshold ?? null,
      enabled: opts.enabled ?? true,
    },
  });
  revalidatePath("/");
}

export async function setBookmarkNote(bookmarkId: string, note: string) {
  await prisma.bookmark.update({ where: { id: bookmarkId }, data: { note } });
  revalidatePath("/");
}

export interface ImportResult {
  imported: number;
  markets: number;
  failures: string[];
}

/**
 * Import bookmarks by pasting Polymarket URLs / slugs (one per line).
 * Each line is resolved via Gamma; an event URL imports all its markets.
 */
export async function importByText(text: string): Promise<ImportResult> {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const result: ImportResult = { imported: 0, markets: 0, failures: [] };

  for (const line of lines) {
    const slug = parseSlug(line);
    if (!slug) {
      result.failures.push(`${line} (couldn't parse)`);
      continue;
    }
    try {
      const markets = await resolveSlugToMarkets(slug);
      if (markets.length === 0) {
        result.failures.push(`${slug} (not found)`);
        continue;
      }
      for (const m of markets) {
        await addBookmark(m);
        result.markets += 1;
      }
      result.imported += 1;
    } catch {
      result.failures.push(`${slug} (lookup failed — Polymarket unreachable?)`);
    }
  }

  revalidatePath("/");
  return result;
}

/** Pull latest market data for a bookmark on demand. */
export async function refreshBookmark(bookmarkId: string) {
  const bm = await prisma.bookmark.findUnique({ where: { id: bookmarkId } });
  if (!bm) return;
  const market = await getMarket(bm.marketId);
  if (!market) return;
  await addBookmark(market); // upsert + snapshot
}
