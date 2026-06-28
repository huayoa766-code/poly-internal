"use client";

import { useState, useTransition } from "react";
import { removeBookmark, toggleBookmarkCategory, setAlertRule } from "@/app/actions";

export interface CardCategory {
  id: string;
  name: string;
  color: string | null;
  active: boolean;
}

export interface CardAlerts {
  priceEnabled: boolean;
  deadlineEnabled: boolean;
  newsEnabled: boolean;
  /** Per-market price-move threshold in points (null = use global default). */
  priceThresholdPts: number | null;
}

export interface CardData {
  id: string;
  question: string;
  slug: string;
  pmCategory: string | null;
  endDate: string | null;
  note: string | null;
  outcomes: { name: string; price: number }[];
  categories: CardCategory[];
  alerts: CardAlerts;
}

const DEFAULT_PRICE_PTS = 5;

function pct(p: number) {
  return `${Math.round(p * 100)}%`;
}

function deadlineLabel(endDate: string | null): { text: string; urgent: boolean } | null {
  if (!endDate) return null;
  const ms = new Date(endDate).getTime() - Date.now();
  if (Number.isNaN(ms)) return null;
  if (ms <= 0) return { text: "ended", urgent: true };
  const hours = ms / 3_600_000;
  if (hours < 24) return { text: `ends in ${Math.round(hours)}h`, urgent: true };
  const days = Math.round(hours / 24);
  return { text: `ends in ${days}d`, urgent: days <= 3 };
}

function AlertSettings({ id, alerts }: { id: string; alerts: CardAlerts }) {
  const [pending, startTransition] = useTransition();
  const [pts, setPts] = useState(alerts.priceThresholdPts ?? DEFAULT_PRICE_PTS);

  const toggle = (type: "price" | "deadline" | "news", enabled: boolean) =>
    startTransition(async () => {
      await setAlertRule(id, type, { enabled });
    });

  const commitPts = (value: number) =>
    startTransition(async () => {
      await setAlertRule(id, "price", { threshold: value / 100 });
    });

  const Toggle = ({
    type,
    label,
    on,
  }: {
    type: "price" | "deadline" | "news";
    label: string;
    on: boolean;
  }) => (
    <label className="flex items-center gap-1.5 text-xs text-neutral-400">
      <input
        type="checkbox"
        checked={on}
        disabled={pending}
        onChange={(e) => toggle(type, e.target.checked)}
        className="accent-emerald-500"
      />
      {label}
    </label>
  );

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-neutral-800 pt-3">
      <Toggle type="price" label="Price" on={alerts.priceEnabled} />
      <label className="flex items-center gap-1.5 text-xs text-neutral-400">
        ≥
        <input
          type="number"
          min={1}
          max={50}
          value={pts}
          disabled={pending || !alerts.priceEnabled}
          onChange={(e) => setPts(Number(e.target.value))}
          onBlur={() => commitPts(pts)}
          className="w-12 rounded border border-neutral-700 bg-neutral-900 px-1 py-0.5 text-center disabled:opacity-40"
        />
        pts
      </label>
      <Toggle type="deadline" label="Deadline" on={alerts.deadlineEnabled} />
      <Toggle type="news" label="News" on={alerts.newsEnabled} />
    </div>
  );
}

export function BookmarkCard({ data }: { data: CardData }) {
  const [pending, startTransition] = useTransition();
  const deadline = deadlineLabel(data.endDate);

  return (
    <li className="rounded border border-neutral-800 p-4">
      <div className="flex items-start justify-between gap-4">
        <a
          href={`https://polymarket.com/event/${data.slug}`}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-medium hover:underline"
        >
          {data.question}
        </a>
        <button
          disabled={pending}
          onClick={() => startTransition(() => removeBookmark(data.id))}
          className="shrink-0 text-xs text-neutral-500 hover:text-red-400 disabled:opacity-50"
        >
          remove
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-400">
        {data.pmCategory && <span className="text-neutral-300">{data.pmCategory}</span>}
        {data.outcomes.slice(0, 4).map((o) => (
          <span key={o.name}>
            {o.name} <span className="text-neutral-200">{pct(o.price)}</span>
          </span>
        ))}
        {deadline && (
          <span className={deadline.urgent ? "text-amber-400" : ""}>{deadline.text}</span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {data.categories.map((c) => (
          <button
            key={c.id}
            disabled={pending}
            onClick={() => startTransition(() => toggleBookmarkCategory(data.id, c.id))}
            className={`rounded-full px-2 py-0.5 text-xs border disabled:opacity-50 ${
              c.active
                ? "border-emerald-500 bg-emerald-500/15 text-emerald-300"
                : "border-neutral-700 text-neutral-500 hover:border-neutral-500"
            }`}
          >
            {c.name}
          </button>
        ))}
        {data.categories.length === 0 && (
          <span className="text-xs text-neutral-600">no categories yet — create one above</span>
        )}
      </div>

      <AlertSettings id={data.id} alerts={data.alerts} />
    </li>
  );
}
