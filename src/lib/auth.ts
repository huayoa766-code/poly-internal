import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Tiny single-PIN gate for this internal dashboard. The PIN lives in the
 * environment (`DASHBOARD_PIN`) — never hardcoded — so exposing the URL alone
 * doesn't grant access. The browser only ever holds an opaque HMAC token (the
 * "session"), never the PIN itself, and the token can't be forged without
 * knowing the signing key.
 *
 * Runs on the Node.js runtime (Next 16 Proxy defaults to Node), so `node:crypto`
 * is available here and in `proxy.ts`.
 */

export const AUTH_COOKIE = "poly_auth";

// Bound into every token so changing it (e.g. PIN rotation) invalidates old sessions.
const TOKEN_MESSAGE = "poly-internal-auth-v1";

/** The configured PIN, or null when auth is disabled (no PIN set). */
export function getConfiguredPin(): string | null {
  const pin = process.env.DASHBOARD_PIN?.trim();
  return pin ? pin : null;
}

/** Whether the PIN gate is active. With no PIN configured, the app is open. */
export function authEnabled(): boolean {
  return getConfiguredPin() !== null;
}

/**
 * Key used to sign the session token. Prefer a dedicated `AUTH_SECRET`; fall
 * back to the PIN so the cookie is still unforgeable without it. The PIN is
 * mixed in either way, so rotating it logs everyone out.
 */
function signingKey(): string {
  const secret = process.env.AUTH_SECRET?.trim() ?? "";
  return `${secret}:${getConfiguredPin() ?? ""}`;
}

/** Opaque token stored in the auth cookie once a correct PIN is entered. */
export function sessionToken(): string {
  return createHmac("sha256", signingKey()).update(TOKEN_MESSAGE).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  // timingSafeEqual throws on length mismatch, so guard first.
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Validate a cookie token against the expected one (constant time). */
export function isValidToken(token: string | undefined): boolean {
  if (!token) return false;
  return safeEqual(token, sessionToken());
}

/** Constant-time check of a submitted PIN against the configured one. */
export function pinMatches(submitted: string): boolean {
  const pin = getConfiguredPin();
  if (!pin) return false;
  return safeEqual(submitted, pin);
}
