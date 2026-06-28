"use client";

import { useState, useTransition } from "react";
import { importByText, type ImportResult } from "@/app/actions";

export function ImportBox() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="rounded border border-neutral-800 p-3">
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-sm text-neutral-300 hover:text-neutral-100"
      >
        {open ? "▾" : "▸"} Import from Polymarket (paste watchlist URLs)
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-neutral-500">
            Paste market/event links from your Polymarket watchlist, one per line
            (e.g. <code>polymarket.com/event/...</code>). An event link imports all its markets.
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            placeholder={"https://polymarket.com/event/...\nhttps://polymarket.com/event/..."}
            className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm font-mono"
          />
          <div className="flex items-center gap-3">
            <button
              disabled={pending || !text.trim()}
              onClick={() =>
                startTransition(async () => {
                  const r = await importByText(text);
                  setResult(r);
                  if (r.failures.length === 0) setText("");
                })
              }
              className="rounded bg-neutral-100 text-neutral-900 px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              {pending ? "Importing…" : "Import"}
            </button>
            {result && (
              <span className="text-xs text-neutral-400">
                Imported {result.imported} link(s) → {result.markets} market(s)
                {result.failures.length > 0 && `, ${result.failures.length} failed`}
              </span>
            )}
          </div>
          {result && result.failures.length > 0 && (
            <ul className="text-xs text-amber-400 list-disc pl-5">
              {result.failures.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
