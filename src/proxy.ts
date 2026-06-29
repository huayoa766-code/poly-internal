import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE, authEnabled, isValidToken } from "@/lib/auth";

// Next 16 renamed `middleware` -> `proxy` (Node.js runtime by default).
// This gates the whole UI behind the PIN: any request without a valid session
// cookie is bounced to /login before a single byte of dashboard data renders,
// so leaking the URL doesn't leak the data. Server Actions POST to their own
// route, so they're covered by the same matcher (login's action lives on
// /login, which is excluded, so unlocking still works).
export function proxy(request: NextRequest) {
  // No PIN configured -> gate is off (e.g. local dev without auth).
  if (!authEnabled()) return NextResponse.next();

  const token = request.cookies.get(AUTH_COOKIE)?.value;
  if (isValidToken(token)) return NextResponse.next();

  const url = request.nextUrl.clone();
  const next = url.pathname + url.search;
  url.pathname = "/login";
  url.search = "";
  if (next && next !== "/") url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}

export const config = {
  // Gate everything except the login page itself and static assets.
  matcher: ["/((?!login|_next/static|_next/image|favicon.ico).*)"],
};
