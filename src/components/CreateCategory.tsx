"use client";

import { useRef, useTransition } from "react";
import { createCategory } from "@/app/actions";

export function CreateCategory() {
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLInputElement>(null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const name = ref.current?.value ?? "";
        if (!name.trim()) return;
        startTransition(async () => {
          await createCategory(name);
          if (ref.current) ref.current.value = "";
        });
      }}
      className="flex gap-2"
    >
      <input
        ref={ref}
        placeholder="New category (e.g. Elections, Crypto, AI)…"
        className="flex-1 rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm"
      />
      <button
        disabled={pending}
        className="rounded border border-neutral-600 px-3 py-1.5 text-sm hover:bg-neutral-800 disabled:opacity-50"
      >
        Add category
      </button>
    </form>
  );
}
