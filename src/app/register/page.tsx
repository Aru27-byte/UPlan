import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/ui/auth-shell";

import { RegisterForm } from "./register-form.client";

export const metadata: Metadata = { title: "Register · UPlan" };

// TechDesign/accounts-roles.md — R2, R11, R12. The plain sentence about access is part of the
// requirement: a new person should know why no city data shows up right after registering.
export default function RegisterPage() {
  return (
    <AuthShell>
      <p className="eyebrow text-accent-lime">Get started</p>
      <h1 className="mt-2 font-display text-4xl font-extrabold tracking-[-0.03em] text-heading">Register for UPlan</h1>
      <p className="mt-2 mb-8 text-muted">
        Registering creates your account. It doesn&rsquo;t open a city&rsquo;s data: UPlan staff give you
        access to your city afterward.
      </p>

      <RegisterForm />

      <p className="mt-8 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-semibold text-brand underline decoration-2 underline-offset-4 hover:text-accent-gold">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
