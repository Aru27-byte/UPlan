import { NextResponse, type NextRequest } from "next/server";

import { refreshSession } from "@/platform/auth";

// TechDesign/system-architecture.md — "Authorization lives in modules." This file refreshes the
// Supabase session and redirects a signed-out page visit; it is never the security boundary
// (.claude/rules/do-not.md: "Don't rely on src/proxy.ts for authorization" — every module function
// checks access itself, again, on every call).
//
// "/" is the public landing page (UIDesign/Landing.png) and stays reachable signed out, exactly
// like the sign-in and register pages and the emailed-link callback — every other path redirects.
const PUBLIC_PATHS = new Set(["/", "/sign-in", "/register", "/auth/callback"]);

export async function proxy(request: NextRequest) {
  const { response, isSignedIn } = await refreshSession(request);
  if (isSignedIn || PUBLIC_PATHS.has(request.nextUrl.pathname)) return response;

  const signIn = new URL("/sign-in", request.url);
  signIn.searchParams.set("next", request.nextUrl.pathname);
  const redirect = NextResponse.redirect(signIn);
  // The refresh may have cleared a dead session's cookies; the redirect has to carry that too.
  for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}

export const config = {
  // `basemap` is exempted to match production, where Caddy serves it directly (deploy/Caddyfile's
  // `handle_path /basemap/*`) before any request reaches this app at all — it's public map tile
  // imagery, not decision data, so local dev (which has no Caddy in front of it) shouldn't gate it
  // behind a session either. `maplibre` is the map's vector-tile worker (public/maplibre/, copied out
  // of node_modules): the signed-out landing page's map loads it, and a redirect to sign-in in its
  // place leaves the map blank. Also public static code, not decision data. This still isn't a
  // security boundary (see the comment above): every module function checks access itself
  // regardless of what this matcher does or doesn't cover.
  matcher: ["/((?!api/health|api/tiles|basemap|maplibre|_next/static|_next/image|favicon.ico).*)"],
};
