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

/**
 * How long a session stays valid after logging in, in hours (default 12).
 * The cookie itself is session-scoped (cleared when the browser session ends),
 * and the token also carries this hard expiry the server enforces — so the PIN
 * is required again each new session, and at the latest after this window.
 */
function sessionTtlMs(): number {
  const hours = Number(process.env.SESSION_TTL_HOURS);
  return (Number.isFinite(hours) && hours > 0 ? hours : 12) * 3_600_000;
}

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

function sign(payload: string): string {
  return createHmac("sha256", signingKey()).update(payload).digest("hex");
}

/**
 * Build a fresh session token: an expiry timestamp signed with the PIN-bound
 * key. Format: `<expiryMs>.<hmac>`. Each login mints a new one.
 */
export function createSessionToken(now: number = Date.now()): string {
  const exp = String(now + sessionTtlMs());
  return `${exp}.${sign(exp)}`;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  // timingSafeEqual throws on length mismatch, so guard first.
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Validate a session token: signature must verify and it must not be expired. */
export function isValidToken(token: string | undefined): boolean {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot < 1) return false;
  const exp = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!safeEqual(sig, sign(exp))) return false; // constant-time signature check
  const expMs = Number(exp);
  return Number.isFinite(expMs) && expMs > Date.now();
}

/** Constant-time check of a submitted PIN against the configured one. */
export function pinMatches(submitted: string): boolean {
  const pin = getConfiguredPin();
  if (!pin) return false;
  return safeEqual(submitted, pin);
}
