import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// TechDesign/system-architecture.md — "Authorization lives in modules." This file only redirects a
// signed-out page visit; it is never the security boundary (.claude/rules/do-not.md: "Don't rely on
// src/proxy.ts for authorization" — every module function checks access itself, again, on every call).
//
// "/" is the public landing page (UIDesign/Landing.png) and stays reachable signed out, exactly
// like "/sign-in" — every other path still redirects.
const PUBLIC_PATHS = new Set(["/", "/sign-in"]);

export function proxy(request: NextRequest) {
  const hasSession = getSessionCookie(request);
  if (!hasSession && !PUBLIC_PATHS.has(request.nextUrl.pathname)) {
    const signIn = new URL("/sign-in", request.url);
    signIn.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(signIn);
  }
  return NextResponse.next();
}

export const config = {
  // api/auth must stay reachable while signed out — it's how signing in happens at all. `basemap`
  // is exempted to match production, where Caddy serves it directly (deploy/Caddyfile's
  // `handle_path /basemap/*`) before any request reaches this app at all — it's public map tile
  // imagery, not decision data, so local dev (which has no Caddy in front of it) shouldn't gate it
  // behind a session either. This still isn't a security boundary (see the comment above): every
  // module function checks access itself regardless of what this matcher does or doesn't cover.
  matcher: ["/((?!api/health|api/tiles|api/auth|basemap|_next/static|_next/image|favicon.ico).*)"],
};
