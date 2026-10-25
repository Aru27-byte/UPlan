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
        <p role="alert" className="message-in rounded-xl border border-danger/45 bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
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
      <Button type="submit" isDisabled={isPending} size="lg" className="mt-1 w-full">
        {isPending ? "Signing in…" : "Sign in"}
      </Button>
    </Form>
  );
}
