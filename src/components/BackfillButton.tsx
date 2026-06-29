"use client";

import { useState, useTransition } from "react";
import { backfillGrouping } from "@/app/actions";

/**
 * Shown when some bookmarks predate grouping. Re-fetches them from Polymarket
 * to fill in series + predefined tags so they join the grouped/filtered view.
 */
export function BackfillButton({ pending: count }: { pending: number }) {
  const [working, startTransition] = useTransition();
  const [done, setDone] = useState<string | null>(null);

  if (count === 0) return null;

  return (
    <div className="flex items-center gap-3 rounded border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs">
      <span className="text-amber-300">
        {count} bookmark(s) aren&apos;t categorized yet.
      </span>
      <button
        disabled={working}
        onClick={() =>
          startTransition(async () => {
            const r = await backfillGrouping();
            setDone(`Updated ${r.updated}, ${r.failed} failed.`);
          })
        }
        className="rounded bg-neutral-100 px-2 py-1 font-medium text-neutral-900 disabled:opacity-50"
      >
        {working ? "Categorizing…" : "Categorize now"}
      </button>
      {done && <span className="text-neutral-400">{done}</span>}
    </div>
  );
}
