import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { isAuthApiError, isAuthSessionMissingError, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { env } from "./env";
import { ValidationError } from "./errors";

// The auth boundary (TechDesign/accounts-roles.md, D14): Supabase Auth holds identities, passwords,
// and sessions, and is only ever called from the server. The browser holds no Supabase client, so
// no key reaches it and every session cookie can be HttpOnly.
export type SessionUser = { id: string; email: string; name: string };

const ClaimsSchema = z.object({
  sub: z.string().min(1),
  email: z.email(),
  user_metadata: z.object({ full_name: z.string().trim().min(1) }),
});

const isProduction = env.NODE_ENV === "production";

/**
 * R8: @supabase/ssr writes its cookies readable by scripts because its own browser client needs
 * them. Nothing here uses a browser client, so every session cookie is forced HttpOnly and
 * SameSite=Lax, and Secure in production.
 */
export function hardenCookie(options: CookieOptions, isProd: boolean): CookieOptions {
  return { ...options, httpOnly: true, sameSite: "lax", secure: isProd };
}

// getClaims() verifies the access token against Supabase's signing keys and refreshes it when it
// has expired. Null means "no usable session": none, or Supabase rejected it (a revoked or expired
// refresh token). Anything else — Supabase unreachable — throws, so it reaches the logs.
async function getClaimsOrNull(supabase: SupabaseClient) {
  const { data, error } = await supabase.auth.getClaims();
  if (error) {
    if (isAuthApiError(error) || isAuthSessionMissingError(error)) return null;
    throw error;
  }
  return data?.claims ?? null;
}

/**
 * A client that can write session cookies. Only for Server Functions and route handlers: React
 * refuses cookie writes during a Server Component render.
 */
export async function createSupabaseClient() {
  const cookieStore = await cookies();
  return createServerClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        for (const { name, value, options } of toSet) {
          cookieStore.set(name, value, hardenCookie(options, isProduction));
        }
      },
    },
  });
}

/**
 * The signed-in person for this request, or null. Read-only on purpose: src/proxy.ts has already
 * refreshed the session and put the fresh cookies on the request, so a render never needs to write
 * one.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const supabase = createServerClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    cookies: { getAll: () => cookieStore.getAll() },
  });
  const claims = await getClaimsOrNull(supabase);
  if (!claims) return null;

  const parsed = ClaimsSchema.safeParse(claims);
  if (!parsed.success) {
    throw new ValidationError(
      "This account has no name on file. Accounts made outside UPlan's register page can't sign in.",
    );
  }
  return { id: parsed.data.sub, email: parsed.data.email, name: parsed.data.user_metadata.full_name };
}

/**
 * For src/proxy.ts: refreshes the session and returns the response that carries the refreshed
 * cookies, plus whether anyone is signed in. It only asks "signed in?", never who: parsing the
 * name here would lock an odd account out of /sign-in itself.
 */
export async function refreshSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet, headers) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) {
          response.cookies.set(name, value, hardenCookie(options, isProduction));
        }
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });
  const claims = await getClaimsOrNull(supabase);
  return { response, isSignedIn: claims !== null };
}
