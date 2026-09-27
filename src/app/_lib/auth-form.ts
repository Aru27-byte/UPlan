import { isAuthApiError } from "@supabase/supabase-js";
import { z } from "zod";

import { logger } from "@/platform/logger";

// Shared by the sign-in and register Server Functions (TechDesign/accounts-roles.md, R1, R10, R11).
// Lives beside the routes, not in a "use server" file, because those may only export async
// functions and the schemas need exporting for their tests.

export type AuthFormState = {
  /** A failure that isn't about one field: wrong credentials, Supabase unreachable. */
  error?: string;
  /** Per-field messages, keyed by input name, for React Aria's Form `validationErrors`. */
  fieldErrors?: Record<string, string[]>;
  /** The text fields as entered — React resets an uncontrolled form after an action. Never a password. */
  values?: Record<string, string>;
  /** Set when Supabase wants the address confirmed before it will sign the person in. */
  confirmEmail?: string;
};

const EmailSchema = z.string().trim().pipe(z.email("Enter a valid email address."));

export const SignInFormSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1, "Enter your password."),
  next: z.string().optional(),
});

export const RegisterFormSchema = z
  .object({
    fullName: z.string().trim().min(1, "Enter your full name."),
    email: EmailSchema,
    password: z.string().min(8, "Use at least 8 characters."),
    confirmPassword: z.string(),
  })
  .refine((form) => form.password === form.confirmPassword, {
    path: ["confirmPassword"],
    message: "The passwords don't match.",
  });

export const DEFAULT_LANDING_PATH = "/dashboard";

/**
 * R10: where to send a person after signing in. Only a path on this site: anything that parses to
 * another origin, or that a browser could read as one (`//host`, `/\host`), gets the default.
 */
export function safeNextPath(next: string | undefined): string {
  if (next === undefined || !next.startsWith("/") || next.includes("\\")) return DEFAULT_LANDING_PATH;
  const base = "http://uplan.invalid";
  const url = new URL(next, base);
  if (url.origin !== base) return DEFAULT_LANDING_PATH;
  return `${url.pathname}${url.search}`;
}

/** The text inputs to hand back to the form after a failed submit. Skips anything that isn't text. */
export function echoValues(formData: FormData, names: readonly string[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const name of names) {
    const value = formData.get(name);
    if (typeof value === "string") values[name] = value;
  }
  return values;
}

export const EMAIL_TAKEN_MESSAGE = "An account with this email already exists. Sign in instead.";

const CODE_MESSAGES: Record<string, string> = {
  invalid_credentials: "That email and password don't match. Check them and try again.",
  email_not_confirmed: "Confirm your email address first. Open the link we sent you, then sign in.",
  over_request_rate_limit: "Too many attempts. Wait a few minutes and try again.",
  over_email_send_rate_limit: "Too many attempts. Wait a few minutes and try again.",
  user_already_exists: EMAIL_TAKEN_MESSAGE,
  email_exists: EMAIL_TAKEN_MESSAGE,
  weak_password: "That password is too easy to guess. Choose a longer or less common one.",
  signup_disabled: "Registration is turned off on this UPlan site. Ask UPlan staff for access.",
};

/**
 * R1: the two ways sign-in fails read differently. Supabase answered and said no (wrong
 * credentials, an unconfirmed address, a rate limit) — or Supabase couldn't be reached at all.
 */
export function describeAuthError(error: unknown): string {
  if (!isAuthApiError(error)) {
    return "UPlan couldn't reach the sign-in service. Try again in a moment, and tell UPlan staff if it keeps happening.";
  }
  return (error.code === undefined ? undefined : CODE_MESSAGES[error.code]) ?? error.message;
}

/** The one place an auth failure becomes form state, and the one place it's logged. */
export function authFailure(error: unknown, values: Record<string, string>): AuthFormState {
  // An API error is Supabase answering; anything else means it couldn't be reached, which staff
  // need to see in the logs (R1, and D14's note on a paused free project).
  if (!isAuthApiError(error)) logger.error({ err: error }, "Supabase Auth request failed");
  return { error: describeAuthError(error), values };
}

export function toFieldErrors(error: z.ZodError): Record<string, string[]> {
  return z.flattenError(error).fieldErrors;
}
