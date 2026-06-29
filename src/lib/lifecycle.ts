/**
 * Bookmark lifecycle: when a market's end date has passed it's "ended" and is
 * hidden from the dashboard immediately, then hard-deleted after a grace window
 * (so the resolution alert + a brief review period survive first).
 *
 * "Ended" is keyed off end date (not Polymarket's `closed` flag) per the chosen
 * behavior — a market is gone from the list the moment its deadline passes.
 */

import { prisma } from "./db";

/** Days after a market's end date before its bookmark is hard-deleted. */
export const ENDED_GRACE_DAYS = Number(process.env.ENDED_GRACE_DAYS ?? "7");

const DAY_MS = 86_400_000;

/** A bookmark is "ended" once its end date is in the past. */
export function isEnded(endDate: Date | null, now: Date = new Date()): boolean {
  return endDate != null && endDate.getTime() < now.getTime();
}

/** End dates older than this are past the grace window and eligible for deletion. */
export function graceCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - ENDED_GRACE_DAYS * DAY_MS);
}

/**
 * Hard-delete bookmarks whose end date is older than the grace window.
 * Cascades remove their snapshots / rules / category tags. Returns the count.
 */
export async function cleanupEndedBookmarks(now: Date = new Date()): Promise<number> {
  const { count } = await prisma.bookmark.deleteMany({
    where: { endDate: { lt: graceCutoff(now) } },
  });
  return count;
}
