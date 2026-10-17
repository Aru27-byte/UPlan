"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Form } from "react-aria-components";

import type { AuthFormState } from "@/app/_lib/auth-form";
import { Button } from "@/ui/button.client";
import { TextField } from "@/ui/text-field.client";

import { register } from "./actions";

// TechDesign/accounts-roles.md — R2, R11, R12. Once Supabase says the address needs confirming, the
// form gives way to a plain message: there is nothing left to fill in.
export function RegisterForm() {
  const [state, formAction, isPending] = useActionState<AuthFormState, FormData>(register, {});

  if (state.confirmEmail !== undefined) {
    return (
      <div role="status" className="rounded-2xl border border-ok/45 bg-ok-soft px-6 py-5">
        <h2 className="font-display text-xl font-bold text-heading">Check your email</h2>
        <p className="mt-2 text-sm text-text">
          We sent a confirmation link to <strong>{state.confirmEmail}</strong>. Open it, then{" "}
          <Link href="/sign-in" className="font-semibold text-brand underline underline-offset-4 hover:text-accent-gold">
            sign in
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <Form action={formAction} validationErrors={state.fieldErrors} className="flex flex-col gap-5">
      {state.error === undefined ? null : (
        <p role="alert" className="rounded-xl border border-danger/45 bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
          {state.error}
        </p>
      )}
      <TextField
        label="Full name"
        name="fullName"
        autoComplete="name"
        isRequired
        defaultValue={state.values?.fullName}
      />
      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        isRequired
        defaultValue={state.values?.email}
      />
      <TextField
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        hint="At least 8 characters."
        isRequired
        minLength={8}
      />
      <TextField
        label="Confirm password"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        isRequired
      />
      <Button type="submit" isDisabled={isPending} size="lg" className="mt-1 w-full">
        {isPending ? "Creating account…" : "Create account"}
      </Button>
    </Form>
  );
}
