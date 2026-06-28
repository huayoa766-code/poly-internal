import { searchMarkets } from "@/lib/polymarket";
import { prisma } from "@/lib/db";
import { BookmarkButton } from "@/components/BookmarkButton";

export const dynamic = "force-dynamic";

function pct(p: number) {
  return `${Math.round(p * 100)}%`;
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const { q, category } = await searchParams;

  const bookmarked = await prisma.bookmark.findMany({ select: { marketId: true } });
  const savedIds = new Set(bookmarked.map((b) => b.marketId));

  let markets: Awaited<ReturnType<typeof searchMarkets>> = [];
  let fetchError: string | null = null;
  try {
    markets = await searchMarkets({ query: q, category, limit: 60 });
  } catch (e) {
    fetchError =
      "Couldn't reach the Polymarket API. It may be geo-blocked from this network — try a VPN or run this from your deploy host.";
    console.error("Gamma fetch failed:", e);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Find markets</h1>
        <p className="text-sm text-neutral-400">
          Searches the top open markets by volume on Polymarket. Bookmark any to start tracking.
        </p>
      </div>

      <form className="flex gap-2" action="/search">
        <input
          name="q"
          defaultValue={q}
          placeholder="Keyword (e.g. election, bitcoin, fed)…"
          className="flex-1 rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
        />
        <input
          name="category"
          defaultValue={category}
          placeholder="Category (optional)"
          className="w-48 rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
        />
        <button className="rounded bg-neutral-100 text-neutral-900 px-4 py-2 text-sm font-medium">
          Search
        </button>
      </form>

      {fetchError && (
        <p className="rounded border border-amber-700 bg-amber-950/40 p-3 text-sm text-amber-300">
          {fetchError}
        </p>
      )}

      <ul className="divide-y divide-neutral-800 rounded border border-neutral-800">
        {!fetchError && markets.length === 0 && (
          <li className="p-4 text-sm text-neutral-400">No markets found.</li>
        )}
        {markets.map((m) => (
          <li key={m.id} className="p-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">{m.question}</p>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-400">
                {m.category && <span className="text-neutral-300">{m.category}</span>}
                {m.outcomes.slice(0, 4).map((o) => (
                  <span key={o.name}>
                    {o.name} {pct(o.price)}
                  </span>
                ))}
                {m.endDate && <span>ends {new Date(m.endDate).toLocaleDateString()}</span>}
                <span>vol ${Math.round(m.volume).toLocaleString()}</span>
              </div>
            </div>
            <div className="shrink-0 pt-0.5">
              <BookmarkButton market={m} bookmarked={savedIds.has(m.id)} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
