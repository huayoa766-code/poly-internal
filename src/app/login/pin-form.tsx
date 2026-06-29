"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

const initial: LoginState = {};

export function PinForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(login, initial);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="next" value={next} />
      <input
        name="pin"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        autoFocus
        maxLength={6}
        pattern="\d{6}"
        placeholder="• • • • • •"
        aria-label="6-digit PIN"
        className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-center text-lg tracking-[0.5em] text-neutral-100 outline-none focus:border-neutral-400"
      />
      {state.error && (
        <p className="text-sm text-red-400" role="alert">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-900 hover:bg-white disabled:opacity-60"
      >
        {pending ? "Checking…" : "Unlock"}
      </button>
    </form>
  );
}
