import type { Metadata } from "next";
import { PinForm } from "./pin-form";

export const metadata: Metadata = { title: "Unlock · Poly Tracker" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  // Full-screen modal overlay: a dimmed, blurred backdrop with the PIN card
  // floating on top. The gate is enforced server-side (proxy), so nothing
  // sensitive is rendered behind this — only the blurred app chrome.
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xs rounded-xl border border-neutral-700 bg-neutral-900 p-6 shadow-2xl">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-neutral-800 text-xl">
            🔒
          </div>
          <h1 className="text-lg font-semibold tracking-tight">Poly Tracker</h1>
          <p className="mt-1 mb-5 text-sm text-neutral-400">
            Locked — enter your 6-digit PIN to continue.
          </p>
        </div>
        <PinForm next={next ?? "/"} />
      </div>
    </div>
  );
}
