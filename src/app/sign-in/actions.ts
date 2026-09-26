"use server";

import { redirect } from "next/navigation";

import {
  authFailure,
  echoValues,
  safeNextPath,
  SignInFormSchema,
  toFieldErrors,
  type AuthFormState,
} from "@/app/_lib/auth-form";
import { createSupabaseClient } from "@/platform/auth";

// TechDesign/accounts-roles.md — R1, R10. A Server Function is a boundary: it validates the form,
// makes the one Supabase call, and turns the outcome into state the form shows. `redirect` works by
// throwing, so it stays outside any try.
export async function signIn(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const values = echoValues(formData, ["email"]);
  const parsed = SignInFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error), values };

  const supabase = await createSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) return authFailure(error, values);

  redirect(safeNextPath(parsed.data.next));
}
