import Link from "next/link";
import { prisma } from "@/lib/db";
import { BookmarkCard, type CardData } from "@/components/BookmarkCard";
import { CreateCategory } from "@/components/CreateCategory";
import { ImportBox } from "@/components/ImportBox";
import {
  DashboardControls,
  type SortKey,
  type TagOption,
} from "@/components/DashboardControls";
import { SeriesGroup } from "@/components/SeriesGroup";
import { BackfillButton } from "@/components/BackfillButton";
import { ManualLabels } from "@/components/ManualLabels";
import { isEnded, ENDED_GRACE_DAYS } from "@/lib/lifecycle";

export const dynamic = "force-dynamic";

type BookmarkRow = Awaited<ReturnType<typeof loadBookmarks>>[number];

function loadBookmarks() {
  return prisma.bookmark.findMany({
    orderBy: [{ endDate: "asc" }],
    include: { tags: true, rules: true },
  });
}

function parseTags(json: string | null): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

const SORTS: SortKey[] = ["ending", "recent", "az"];

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tag?: string; sort?: string; cat?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const activeTag = sp.tag ?? null;
  const sort: SortKey = SORTS.includes(sp.sort as SortKey) ? (sp.sort as SortKey) : "ending";

  const [allBookmarks, categories] = await Promise.all([
    loadBookmarks(),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
  ]);

  // Ended markets (past their end date) drop out of the main list immediately;
  // they linger in a collapsible "Recently ended" section until the worker
  // hard-deletes them after the grace window.
  const now = new Date();
  const bookmarks = allBookmarks.filter((b) => !isEnded(b.endDate, now));
  const ended = allBookmarks.filter((b) => isEnded(b.endDate, now));

  // Ignore a stale ?cat= filter (e.g. the category was just deleted) so we never
  // render an empty list for a category that no longer exists.
  const cat = sp.cat && categories.some((c) => c.id === sp.cat) ? sp.cat : null;

  // Predefined tag options (counts across all bookmarks), most common first.
  const tagCounts = new Map<string, number>();
  for (const b of bookmarks) {
    for (const t of parseTags(b.pmTags)) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  }
  const tagOptions: TagOption[] = [...tagCounts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 24);

  // Apply filters: predefined tag, free-text search, and (legacy) manual category.
  const ql = q.toLowerCase();
  const filtered = bookmarks.filter((b) => {
    if (activeTag && !parseTags(b.pmTags).includes(activeTag)) return false;
    if (cat && !b.tags.some((t) => t.categoryId === cat)) return false;
    if (ql && !b.question.toLowerCase().includes(ql)) return false;
    return true;
  });

  const ungroupedCount = bookmarks.filter(
    (b) => !b.seriesId && !b.eventSlug && !b.pmTags,
  ).length;

  const toCard = (b: BookmarkRow): CardData => {
    const active = new Set(b.tags.map((t) => t.categoryId));
    const rule = (type: string) => b.rules.find((r) => r.type === type);
    const priceRule = rule("price");
    return {
      id: b.id,
      question: b.question,
      slug: b.eventSlug ?? b.slug,
      pmCategory: b.pmCategory,
      endDate: b.endDate ? b.endDate.toISOString() : null,
      note: b.note,
      outcomes: b.outcomes ? (JSON.parse(b.outcomes) as { name: string; price: number }[]) : [],
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        color: c.color,
        active: active.has(c.id),
      })),
      alerts: {
        priceEnabled: priceRule?.enabled ?? true,
        deadlineEnabled: rule("deadline")?.enabled ?? true,
        newsEnabled: rule("news")?.enabled ?? true,
        priceThresholdPts:
          priceRule?.threshold != null ? Math.round(priceRule.threshold * 100) : null,
      },
    };
  };

  // Build display entries: a series groups its date-variants; everything else
  // is a standalone card. Single-member series aren't worth a group.
  type GroupEntry = {
    kind: "group";
    key: string;
    title: string;
    recurrence: string | null;
    rows: BookmarkRow[];
  };
  type SingleEntry = { kind: "single"; key: string; row: BookmarkRow };
  type Entry = GroupEntry | SingleEntry;

  const bySeries = new Map<string, BookmarkRow[]>();
  const singles: BookmarkRow[] = [];
  for (const b of filtered) {
    if (b.seriesId) {
      const arr = bySeries.get(b.seriesId) ?? [];
      arr.push(b);
      bySeries.set(b.seriesId, arr);
    } else {
      singles.push(b);
    }
  }

  const entries: Entry[] = [];
  for (const [key, rows] of bySeries) {
    if (rows.length === 1) {
      singles.push(rows[0]);
    } else {
      entries.push({
        kind: "group",
        key,
        title: rows[0].seriesTitle ?? "Series",
        recurrence: rows[0].seriesRecurrence,
        rows,
      });
    }
  }
  for (const row of singles) entries.push({ kind: "single", key: row.id, row });

  const endMs = (b: BookmarkRow) => b.endDate?.getTime() ?? Number.POSITIVE_INFINITY;
  const createdMs = (b: BookmarkRow) => b.createdAt.getTime();
  const entryEnd = (e: Entry) =>
    e.kind === "single" ? endMs(e.row) : Math.min(...e.rows.map(endMs));
  const entryCreated = (e: Entry) =>
    e.kind === "single" ? createdMs(e.row) : Math.max(...e.rows.map(createdMs));
  const entryTitle = (e: Entry) =>
    (e.kind === "single" ? e.row.question : e.title).toLowerCase();

  entries.sort((a, b) => {
    if (sort === "recent") return entryCreated(b) - entryCreated(a);
    if (sort === "az") return entryTitle(a).localeCompare(entryTitle(b));
    return entryEnd(a) - entryEnd(b); // "ending"
  });

  // Sort variants inside a group by their own end date.
  for (const e of entries) {
    if (e.kind === "group") e.rows.sort((x, y) => endMs(x) - endMs(y));
  }

  const fmtDate = (d: Date | null) =>
    d ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Bookmarks</h1>
        <Link href="/search" className="text-sm text-neutral-400 hover:text-neutral-100">
          + Find markets
        </Link>
      </div>

      <ImportBox />
      <BackfillButton pending={ungroupedCount} />

      <DashboardControls tags={tagOptions} q={q} activeTag={activeTag} sort={sort} />

      {entries.length === 0 ? (
        <p className="text-sm text-neutral-400">
          {allBookmarks.length === 0 ? (
            <>
              No bookmarks yet.{" "}
              <Link href="/search" className="underline">
                Find some markets
              </Link>{" "}
              to track.
            </>
          ) : (
            "No markets match these filters."
          )}
        </p>
      ) : (
        <ul className="space-y-3">
          {entries.map((e) =>
            e.kind === "group" ? (
              <SeriesGroup
                key={e.key}
                title={e.title}
                recurrence={e.recurrence}
                count={e.rows.length}
                summary={`next ends ${fmtDate(e.rows[0].endDate)}`}
              >
                {e.rows.map((row) => (
                  <BookmarkCard key={row.id} data={toCard(row)} />
                ))}
              </SeriesGroup>
            ) : (
              <BookmarkCard key={e.key} data={toCard(e.row)} />
            ),
          )}
        </ul>
      )}

      {ended.length > 0 && (
        <details className="text-sm text-neutral-500">
          <summary className="cursor-pointer hover:text-neutral-300">
            Recently ended ({ended.length}) — auto-removed {ENDED_GRACE_DAYS}d after closing
          </summary>
          <ul className="mt-3 space-y-3 opacity-70">
            {ended
              .sort((a, b) => endMs(b) - endMs(a)) // most recently ended first
              .map((row) => (
                <BookmarkCard key={row.id} data={toCard(row)} />
              ))}
          </ul>
        </details>
      )}

      <details className="text-sm text-neutral-500">
        <summary className="cursor-pointer hover:text-neutral-300">
          Manual labels (optional)
        </summary>
        <div className="mt-3 space-y-3">
          <CreateCategory />
          <ManualLabels
            categories={categories.map((c) => ({ id: c.id, name: c.name }))}
            activeCat={cat}
          />
        </div>
      </details>
    </div>
  );
}
