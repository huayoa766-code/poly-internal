"use client";

import { useState } from "react";

/**
 * Collapsible group for recurring date-variants that share a Polymarket series
 * (e.g. "BTC Multi Strikes Weekly"). Collapsed by default to keep the list short.
 */
export function SeriesGroup({
  title,
  recurrence,
  count,
  summary,
  defaultOpen = false,
  children,
}: {
  title: string;
  recurrence: string | null;
  count: number;
  summary: string | null;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <li className="rounded border border-neutral-800">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-neutral-900/50"
      >
        <span className="text-neutral-500">{open ? "▾" : "▸"}</span>
        <span className="text-sm font-medium">{title}</span>
        <span className="rounded-full bg-neutral-800 px-1.5 text-xs text-neutral-400">
          {count}
        </span>
        {recurrence && (
          <span className="text-xs text-neutral-500">{recurrence}</span>
        )}
        {!open && summary && (
          <span className="ml-auto truncate text-xs text-neutral-500">{summary}</span>
        )}
      </button>
      {open && <ul className="space-y-2 border-t border-neutral-800 p-3">{children}</ul>}
    </li>
  );
}
