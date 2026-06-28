"use client";

import { useTransition } from "react";
import { addBookmark } from "@/app/actions";
import type { Market } from "@/lib/polymarket";

export function BookmarkButton({ market, bookmarked }: { market: Market; bookmarked: boolean }) {
  const [pending, startTransition] = useTransition();

  if (bookmarked) {
    return <span className="text-xs text-emerald-400">✓ bookmarked</span>;
  }

  return (
    <button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await addBookmark(market);
        })
      }
      className="text-xs rounded bg-neutral-100 text-neutral-900 px-2 py-1 font-medium hover:bg-white disabled:opacity-50"
    >
      {pending ? "Saving…" : "+ Bookmark"}
    </button>
  );
}
