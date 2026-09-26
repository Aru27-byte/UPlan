import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/ui/auth-shell";
import { buttonClassName } from "@/ui/button-styles";

import { SignInForm } from "./sign-in-form.client";

export const metadata: Metadata = { title: "Sign in · UPlan" };

// The only notice a redirect can carry here: the emailed confirmation link was opened somewhere the
// sign-up didn't start (src/app/auth/callback/route.ts).
const NOTICES: Record<string, string> = {
  "confirm-failed":
    "We couldn't finish that confirmation link. Your address may already be confirmed — try signing in.",
};

// TechDesign/accounts-roles.md — R1, R10, R12: an email-and-password form with a Register button
// you can't miss, and nothing else to sign in with.
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; notice?: string | string[] }>;
}) {
  const { next, notice } = await searchParams;
  const nextPath = typeof next === "string" ? next : undefined;
  const noticeText = typeof notice === "string" ? NOTICES[notice] : undefined;

  return (
    <AuthShell>
      <p className="eyebrow text-ink/70">Welcome back</p>
      <h1 className="mt-2 text-3xl font-bold">Sign in to UPlan</h1>
      <p className="text-ink/75 mt-2 mb-8">Use the email and password you registered with.</p>

      {noticeText === undefined ? null : (
        <p role="status" className="bg-card-yellow mb-6 rounded-lg border-2 border-ink px-4 py-3 text-sm font-medium">
          {noticeText}
        </p>
      )}

      <SignInForm next={nextPath} />

      <div className="my-8 flex items-center gap-4" aria-hidden>
        <span className="bg-ink/20 h-px flex-1" />
        <span className="eyebrow text-ink/60">New to UPlan?</span>
        <span className="bg-ink/20 h-px flex-1" />
      </div>

      <Link href="/register" className={buttonClassName("secondary", "block w-full py-3 text-center text-ink")}>
        Register
      </Link>
    </AuthShell>
  );
}
