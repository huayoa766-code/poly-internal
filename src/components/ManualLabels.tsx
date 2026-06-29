"use client";

import Link from "next/link";
import { useTransition } from "react";
import { deleteCategory } from "@/app/actions";

/**
 * Manage manual labels: filter by one, or delete it (× removes it from every
 * card). Predefined Polymarket tags are the primary categorization now, so this
 * lives in the optional "Manual labels" section.
 */
export function ManualLabels({
  categories,
  activeCat,
}: {
  categories: { id: string; name: string }[];
  activeCat: string | null;
}) {
  const [pending, startTransition] = useTransition();

  if (categories.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 text-xs">
      <Link
        href="/"
        className={`rounded-full border px-2 py-0.5 ${
          !activeCat ? "border-neutral-300 text-neutral-100" : "border-neutral-700 text-neutral-500"
        }`}
      >
        All
      </Link>
      {categories.map((c) => (
        <span
          key={c.id}
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${
            activeCat === c.id
              ? "border-emerald-500 text-emerald-300"
              : "border-neutral-700 text-neutral-400"
          }`}
        >
          <Link href={`/?cat=${c.id}`} className="hover:text-neutral-100">
            {c.name}
          </Link>
          <button
            aria-label={`Delete ${c.name}`}
            disabled={pending}
            onClick={() => startTransition(() => deleteCategory(c.id))}
            className="text-neutral-600 hover:text-red-400 disabled:opacity-50"
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );
}
