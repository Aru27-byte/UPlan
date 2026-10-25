import type { Metadata } from "next";
import Link from "next/link";

import { actionClassName } from "@/ui/action-styles";
import { AuthShell } from "@/ui/auth-shell";

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
      <p className="eyebrow text-accent-lime">Welcome back</p>
      <h1 className="mt-2 font-display text-4xl font-extrabold tracking-[-0.03em] text-heading">Sign in to UPlan</h1>
      <p className="mt-2 mb-8 text-muted">Use the email and password you registered with.</p>

      {noticeText === undefined ? null : (
        <p role="status" className="message-in mb-6 rounded-xl border border-warn/45 bg-warn-soft px-4 py-3 text-sm font-medium text-text">
          {noticeText}
        </p>
      )}

      <SignInForm next={nextPath} />

      <div className="my-8 flex items-center gap-4" aria-hidden>
        <span className="h-px flex-1 bg-line-strong" />
        <span className="eyebrow text-faint">New to UPlan?</span>
        <span className="h-px flex-1 bg-line-strong" />
      </div>

      <Link href="/register" className={actionClassName("secondary", "w-full", "lg")}>
        Register
      </Link>
    </AuthShell>
  );
}
