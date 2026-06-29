"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  AUTH_COOKIE,
  authEnabled,
  pinMatches,
  sessionToken,
} from "@/lib/auth";

const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

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
  store.set(AUTH_COOKIE, sessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
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
