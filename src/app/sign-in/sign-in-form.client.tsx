"use client";

import { useActionState } from "react";
import { Form } from "react-aria-components";

import type { AuthFormState } from "@/app/_lib/auth-form";
import { Button } from "@/ui/button.client";
import { TextField } from "@/ui/text-field.client";

import { signIn } from "./actions";

// TechDesign/accounts-roles.md — R1, R10, R12. `next` is the protected page the visitor was sent
// away from; the Server Function checks it again before redirecting (safeNextPath).
export function SignInForm({ next }: { next?: string }) {
  const [state, formAction, isPending] = useActionState<AuthFormState, FormData>(signIn, {});

  return (
    <Form action={formAction} validationErrors={state.fieldErrors} className="flex flex-col gap-5">
      {next === undefined ? null : <input type="hidden" name="next" value={next} />}
      {state.error === undefined ? null : (
        <p role="alert" className="rounded-lg border-2 border-red-800 bg-red-50 px-4 py-3 text-sm font-medium text-red-900">
          {state.error}
        </p>
      )}
      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        isRequired
        defaultValue={state.values?.email}
      />
      <TextField label="Password" name="password" type="password" autoComplete="current-password" isRequired />
      <Button type="submit" isDisabled={isPending} className="mt-1 w-full py-3 text-ink">
        {isPending ? "Signing in…" : "Sign in"}
      </Button>
    </Form>
  );
}
