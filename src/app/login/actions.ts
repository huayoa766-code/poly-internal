"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  AUTH_COOKIE,
  authEnabled,
  createSessionToken,
  pinMatches,
} from "@/lib/auth";

export type LoginState = { error?: string };

/** Verify the submitted PIN and, on success, set the session cookie. */
export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  if (!authEnabled()) return { error: "No PIN configured on the server." };

  const pin = String(formData.get("pin") ?? "").trim();
  if (!/^\d{6}$/.test(pin) || !pinMatches(pin)) {
    return { error: "Incorrect PIN." };
  }

  const store = await cookies();
  // No maxAge/expires => a session cookie: the browser drops it when the
  // session ends, so a new session must re-enter the PIN. The token also
  // carries a server-enforced expiry as a backstop (see createSessionToken).
  store.set(AUTH_COOKIE, createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });

  redirect(safeNext(String(formData.get("next") ?? "")));
}

export async function logout() {
  const store = await cookies();
  store.delete(AUTH_COOKIE);
  redirect("/login");
}

/** Only allow same-site absolute paths back, to avoid open-redirects. */
function safeNext(next: string): string {
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}
