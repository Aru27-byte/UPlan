import { isAuthApiError } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { DEFAULT_LANDING_PATH } from "@/app/_lib/auth-form";
import { createSupabaseClient } from "@/platform/auth";
import { env } from "@/platform/env";

// TechDesign/accounts-roles.md — R11. Where the emailed confirmation link lands: Supabase has
// already confirmed the address and appended a one-time `code`, which this trades for a session.
// If the link is opened in a different browser from the one that registered, the code's PKCE
// verifier cookie is missing and the exchange is refused — the address is confirmed either way, so
// the person is sent to sign in.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (code !== null) {
    const supabase = await createSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(DEFAULT_LANDING_PATH, env.APP_URL));
    // Supabase answering "no" is the different-browser case; anything else is an outage to surface.
    if (!isAuthApiError(error)) throw error;
  }
  return NextResponse.redirect(new URL("/sign-in?notice=confirm-failed", env.APP_URL));
}
