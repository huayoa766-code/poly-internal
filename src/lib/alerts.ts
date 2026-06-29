/**
 * One alerting pass over all bookmarks:
 *   1. refresh price + snapshot
 *   2. detect price moves past threshold
 *   3. detect approaching deadline / resolution
 *   4. fetch fresh keyword news (GDELT)
 *   5. dedupe + send via Telegram
 *
 * Pure orchestration over the lib clients — safe to call from the cron worker
 * or a future /api/cron route. X sentiment can later attach in `enrichAlert`.
 */

import { prisma } from "./db";
import { getMarket } from "./polymarket";
import { extractKeywords, buildNewsQuery } from "./keywords";
import { fetchNews } from "./gdelt";
import { sendTelegram, telegramConfigured, topicFor, topicsConfigured } from "./telegram";
import { categoryOf, categoryOrder, type Category } from "./categories";

const PRICE_THRESHOLD = Number(process.env.PRICE_MOVE_THRESHOLD ?? "0.05"); // 5 points
const DEADLINE_HOURS = Number(process.env.DEADLINE_HOURS ?? "24");
const NEWS_TIMESPAN = process.env.NEWS_TIMESPAN ?? "1h";
const MAX_NEWS_PER_MARKET = Number(process.env.MAX_NEWS_PER_MARKET ?? "3");

export interface PassStats {
  bookmarks: number;
  priceAlerts: number;
  deadlineAlerts: number;
  newsAlerts: number;
  errors: string[];
}

/** Has this exact event already been delivered? */
async function alreadySent(dedupeKey: string): Promise<boolean> {
  const hit = await prisma.sentAlert.findUnique({ where: { dedupeKey } });
  return Boolean(hit);
}

async function deliver(
  dedupeKey: string,
  text: string,
  opts: { payload?: string; threadId?: number } = {},
): Promise<boolean> {
  if (await alreadySent(dedupeKey)) return false;
  await sendTelegram(text, { threadId: opts.threadId });
  await prisma.sentAlert.create({ data: { dedupeKey, payload: opts.payload ?? null } });
  return true;
}

function pct(p: number) {
  return `${Math.round(p * 100)}%`;
}

/** Context subline shown under each alert's headline: category (+ series). */
function contextLine(cat: Category, seriesTitle: string | null): string {
  const series = seriesTitle ? ` · ${seriesTitle}` : "";
  return `<i>${cat.emoji} ${cat.label}${series}</i>`;
}

export async function runAlertPass(): Promise<PassStats> {
  const stats: PassStats = {
    bookmarks: 0,
    priceAlerts: 0,
    deadlineAlerts: 0,
    newsAlerts: 0,
    errors: [],
  };

  const bookmarks = await prisma.bookmark.findMany({
    where: { closed: false },
    include: { rules: true },
  });
  stats.bookmarks = bookmarks.length;

  for (const bm of bookmarks) {
    try {
      const market = await getMarket(bm.marketId);
      if (!market) continue;

      // Per-bookmark overrides; fall back to global env defaults.
      const ruleFor = (type: string) => bm.rules.find((r) => r.type === type);
      const enabled = (type: string) => ruleFor(type)?.enabled ?? true;
      const priceThreshold = ruleFor("price")?.threshold ?? PRICE_THRESHOLD;
      const deadlineHours = ruleFor("deadline")?.threshold ?? DEADLINE_HOURS;

      const primary = market.outcomes[0]; // "Yes" for binary markets
      const marketUrl = `https://polymarket.com/event/${bm.eventSlug ?? market.slug}`;

      // Category drives the alert tag and (optionally) which topic it routes to.
      const cat = categoryOf({ pmTags: bm.pmTags, pmCategory: bm.pmCategory });
      const ctx = contextLine(cat, bm.seriesTitle);
      const threadId = topicFor(cat.label);

      // --- price snapshot (always recorded for history) + move detection ---
      if (primary) {
        const prev = await prisma.priceSnapshot.findFirst({
          where: { bookmarkId: bm.id, outcome: primary.name },
          orderBy: { capturedAt: "desc" },
        });
        await prisma.priceSnapshot.create({
          data: { bookmarkId: bm.id, outcome: primary.name, price: primary.price },
        });

        if (prev && enabled("price")) {
          const delta = primary.price - prev.price;
          if (Math.abs(delta) >= priceThreshold) {
            const band = Math.round(primary.price / priceThreshold);
            const dir = delta > 0 ? "▲" : "▼";
            const text =
              `${dir} <b>${market.question}</b>\n${ctx}\n` +
              `${primary.name} ${pct(prev.price)} → <b>${pct(primary.price)}</b> ` +
              `(${delta > 0 ? "+" : ""}${Math.round(delta * 100)}pts)\n` +
              `<a href="${marketUrl}">open market</a>`;
            if (await deliver(`price:${bm.id}:${band}`, text, { threadId })) stats.priceAlerts++;
          }
        }
      }

      // --- deadline / resolution ---
      if (market.closed) {
        const text = `🏁 <b>${market.question}</b>\n${ctx}\nhas resolved/closed.\n<a href="${marketUrl}">open market</a>`;
        if (await deliver(`resolved:${bm.id}`, text, { threadId })) stats.deadlineAlerts++;
        await prisma.bookmark.update({ where: { id: bm.id }, data: { closed: true } });
      } else if (market.endDate && enabled("deadline")) {
        const hoursLeft = (new Date(market.endDate).getTime() - Date.now()) / 3_600_000;
        if (hoursLeft > 0 && hoursLeft <= deadlineHours) {
          const text =
            `⏰ <b>${market.question}</b> closes in ~${Math.round(hoursLeft)}h.\n${ctx}\n` +
            `${primary ? `${primary.name} ${pct(primary.price)}\n` : ""}` +
            `<a href="${marketUrl}">open market</a>`;
          if (await deliver(`deadline:${bm.id}:${deadlineHours}h`, text, { threadId })) stats.deadlineAlerts++;
        }
      }

      // --- news (keyword match via GDELT) ---
      const keywords = enabled("news") ? extractKeywords(bm.question) : [];
      if (keywords.length) {
        const articles = await fetchNews(buildNewsQuery(keywords), {
          timespan: NEWS_TIMESPAN,
          maxRecords: 10,
        });
        const fresh: typeof articles = [];
        for (const a of articles) {
          if (fresh.length >= MAX_NEWS_PER_MARKET) break;
          if (!(await alreadySent(`news:${a.url}`))) fresh.push(a);
        }
        if (fresh.length) {
          const lines = fresh
            .map((a) => `• <a href="${a.url}">${a.title}</a> <i>(${a.domain})</i>`)
            .join("\n");
          const text =
            `📰 News on <b>${market.question}</b>\n${ctx}\n` +
            `<i>${keywords.join(", ")}</i>\n${lines}\n` +
            `${primary ? `${primary.name} ${pct(primary.price)} · ` : ""}` +
            `<a href="${marketUrl}">open market</a>`;
          // Mark each article sent (dedupe individually) then send the digest.
          await sendTelegram(text, { threadId });
          for (const a of fresh) {
            await prisma.sentAlert.create({ data: { dedupeKey: `news:${a.url}`, payload: a.title } });
          }
          stats.newsAlerts++;
        }
      }
    } catch (e) {
      stats.errors.push(`${bm.marketId}: ${(e as Error).message}`);
    }
  }

  return stats;
}

type DigestRow = {
  question: string;
  outcomes: string | null;
  endDate: Date | null;
  pmTags: string | null;
  pmCategory: string | null;
  seriesId: string | null;
  seriesTitle: string | null;
};

const endMs = (b: DigestRow) => b.endDate?.getTime() ?? Number.POSITIVE_INFINITY;

/** One bullet line for a standalone market. */
function digestLine(bm: DigestRow): string {
  const outcomes = bm.outcomes
    ? (JSON.parse(bm.outcomes) as { name: string; price: number }[])
    : [];
  const p = outcomes[0];
  const ends = bm.endDate ? ` · ends ${bm.endDate.toLocaleDateString()}` : "";
  return `${bm.question}${p ? ` — ${p.name} ${pct(p.price)}` : ""}${ends}`;
}

/** Render a category's markets: recurring series collapse to one line each. */
function renderSectionBody(rows: DigestRow[]): string {
  const bySeries = new Map<string, DigestRow[]>();
  const singles: DigestRow[] = [];
  for (const bm of rows) {
    if (bm.seriesId) {
      const arr = bySeries.get(bm.seriesId) ?? [];
      arr.push(bm);
      bySeries.set(bm.seriesId, arr);
    } else {
      singles.push(bm);
    }
  }
  const lines: string[] = [];
  for (const [, grp] of bySeries) {
    if (grp.length === 1) {
      singles.push(grp[0]);
      continue;
    }
    grp.sort((a, b) => endMs(a) - endMs(b));
    const next = grp[0].endDate ? grp[0].endDate.toLocaleDateString() : "—";
    lines.push(`  ▸ <b>${grp[0].seriesTitle ?? "Series"}</b> (${grp.length}) — next ends ${next}`);
  }
  singles.sort((a, b) => endMs(a) - endMs(b));
  for (const bm of singles.slice(0, 15)) lines.push(`  • ${digestLine(bm)}`);
  return lines.join("\n");
}

/**
 * Daily digest, organized by category.
 *  - Combined (default): one message with a section per category.
 *  - Split: one message per category — auto-enabled when DIGEST_MODE=split or
 *    topic routing (TELEGRAM_TOPICS) is configured; each posts to its topic.
 * Recurring date-variants collapse under their series in every mode.
 */
export async function sendDailyDigest(): Promise<void> {
  const bookmarks = await prisma.bookmark.findMany({
    where: { closed: false },
    orderBy: { endDate: "asc" },
  });
  if (!bookmarks.length) return;

  // Group into category sections, ordered by priority then size.
  const byCat = new Map<string, { cat: Category; rows: DigestRow[] }>();
  for (const bm of bookmarks) {
    const cat = categoryOf({ pmTags: bm.pmTags, pmCategory: bm.pmCategory });
    const g = byCat.get(cat.label) ?? { cat, rows: [] };
    g.rows.push(bm);
    byCat.set(cat.label, g);
  }
  const sections = [...byCat.values()].sort(
    (a, b) => categoryOrder(a.cat.label) - categoryOrder(b.cat.label) || b.rows.length - a.rows.length,
  );

  const combined =
    `🗞 <b>Daily digest</b> (${bookmarks.length} tracked)\n\n` +
    sections
      .map((s) => `${s.cat.emoji} <b>${s.cat.label}</b> (${s.rows.length})\n${renderSectionBody(s.rows)}`)
      .join("\n\n");

  // Split when explicitly requested, when routing to topics, or when the
  // combined message would exceed Telegram's ~4096-char limit.
  const split =
    process.env.DIGEST_MODE === "split" || topicsConfigured() || combined.length > 3900;

  if (!split) {
    await sendTelegram(combined);
    return;
  }

  for (const s of sections) {
    const text =
      `${s.cat.emoji} <b>${s.cat.label}</b> — daily digest (${s.rows.length})\n` +
      renderSectionBody(s.rows);
    await sendTelegram(text, { threadId: topicFor(s.cat.label) });
  }
}

export function alertsReady(): { telegram: boolean } {
  return { telegram: telegramConfigured() };
}
