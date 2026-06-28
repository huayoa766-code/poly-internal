import Link from "next/link";
import { prisma } from "@/lib/db";
import { BookmarkCard, type CardData } from "@/components/BookmarkCard";
import { CreateCategory } from "@/components/CreateCategory";
import { ImportBox } from "@/components/ImportBox";

export const dynamic = "force-dynamic";

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string }>;
}) {
  const { cat } = await searchParams;

  const [bookmarks, categories] = await Promise.all([
    prisma.bookmark.findMany({
      orderBy: [{ endDate: "asc" }],
      include: { tags: true, rules: true },
    }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
  ]);

  const filtered = cat
    ? bookmarks.filter((b) => b.tags.some((t) => t.categoryId === cat))
    : bookmarks;

  const cards: CardData[] = filtered.map((b) => {
    const active = new Set(b.tags.map((t) => t.categoryId));
    const rule = (type: string) => b.rules.find((r) => r.type === type);
    const priceRule = rule("price");
    return {
      id: b.id,
      question: b.question,
      slug: b.slug,
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
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Bookmarks</h1>
        <Link href="/search" className="text-sm text-neutral-400 hover:text-neutral-100">
          + Find markets
        </Link>
      </div>

      <ImportBox />

      <CreateCategory />

      {categories.length > 0 && (
        <div className="flex flex-wrap gap-1.5 text-xs">
          <Link
            href="/"
            className={`rounded-full border px-2 py-0.5 ${
              !cat ? "border-neutral-300 text-neutral-100" : "border-neutral-700 text-neutral-500"
            }`}
          >
            All ({bookmarks.length})
          </Link>
          {categories.map((c) => (
            <Link
              key={c.id}
              href={`/?cat=${c.id}`}
              className={`rounded-full border px-2 py-0.5 ${
                cat === c.id
                  ? "border-emerald-500 text-emerald-300"
                  : "border-neutral-700 text-neutral-400 hover:border-neutral-500"
              }`}
            >
              {c.name}
            </Link>
          ))}
        </div>
      )}

      {cards.length === 0 ? (
        <p className="text-sm text-neutral-400">
          No bookmarks yet.{" "}
          <Link href="/search" className="underline">
            Find some markets
          </Link>{" "}
          to track.
        </p>
      ) : (
        <ul className="space-y-3">
          {cards.map((c) => (
            <BookmarkCard key={c.id} data={c} />
          ))}
        </ul>
      )}
    </div>
  );
}
