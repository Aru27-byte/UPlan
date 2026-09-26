"use server";

import { redirect } from "next/navigation";

import {
  authFailure,
  DEFAULT_LANDING_PATH,
  echoValues,
  EMAIL_TAKEN_MESSAGE,
  RegisterFormSchema,
  toFieldErrors,
  type AuthFormState,
} from "@/app/_lib/auth-form";
import { createSupabaseClient } from "@/platform/auth";
import { env } from "@/platform/env";

// TechDesign/accounts-roles.md — R2, R11. Registering creates an identity and nothing else: the
// app_user row appears on the first signed-in request, and no membership follows from it.
export async function register(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const values = echoValues(formData, ["fullName", "email"]);
  const parsed = RegisterFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error), values };

  const supabase = await createSupabaseClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${env.APP_URL}/auth/callback`,
    },
  });
  if (error) return authFailure(error, values);

  // Supabase hides whether an address is taken by answering a repeat sign-up with a user that has
  // no identities, so that reply is the "already registered" case.
  if (data.user?.identities?.length === 0) return { error: EMAIL_TAKEN_MESSAGE, values };

  // A session means "Confirm email" is off and the person is already signed in. None means they
  // must confirm the address first (R11).
  if (data.session) redirect(DEFAULT_LANDING_PATH);
  return { confirmEmail: parsed.data.email };
}
