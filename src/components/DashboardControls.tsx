"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export interface TagOption {
  label: string;
  count: number;
}

export type SortKey = "ending" | "recent" | "az";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "ending", label: "Ending soon" },
  { key: "recent", label: "Recently added" },
  { key: "az", label: "A–Z" },
];

/**
 * Search box + predefined-tag filter chips + sort selector. All state lives in
 * the URL query string (?q=&tag=&sort=) so the server component can read it.
 */
export function DashboardControls({
  tags,
  q,
  activeTag,
  sort,
}: {
  tags: TagOption[];
  q: string;
  activeTag: string | null;
  sort: SortKey;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const [text, setText] = useState(q);

  // Push query updates, preserving the other params. Empty values are removed.
  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    startTransition(() => router.replace(`/?${next.toString()}`, { scroll: false }));
  };

  // Debounce the search box so we don't navigate on every keystroke.
  useEffect(() => {
    const id = setTimeout(() => {
      if (text !== q) update({ q: text.trim() || null });
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search markets…"
          className="flex-1 rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm"
        />
        <select
          value={sort}
          onChange={(e) => update({ sort: e.target.value })}
          className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-300"
        >
          {SORTS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 text-xs">
          <button
            onClick={() => update({ tag: null })}
            className={`rounded-full border px-2 py-0.5 ${
              !activeTag
                ? "border-neutral-300 text-neutral-100"
                : "border-neutral-700 text-neutral-500 hover:border-neutral-500"
            }`}
          >
            All
          </button>
          {tags.map((t) => (
            <button
              key={t.label}
              onClick={() => update({ tag: activeTag === t.label ? null : t.label })}
              className={`rounded-full border px-2 py-0.5 ${
                activeTag === t.label
                  ? "border-emerald-500 text-emerald-300"
                  : "border-neutral-700 text-neutral-400 hover:border-neutral-500"
              }`}
            >
              {t.label} <span className="text-neutral-600">{t.count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
