"use client";

import { use, type ReactNode } from "react";

import { ActionFormPendingContext } from "./action-form.client";
import { actionClassName, type ActionVariant } from "./action-styles";

// A submit button that disables itself while its form's request is in flight, and says what it is doing
// (project-dashboard.md R10; the browser-honesty rule: block double submission). It reads the enclosing
// ActionForm's pending state, so it must be rendered inside one.
export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  className = "",
  name,
  value,
}: {
  children: ReactNode;
  pendingLabel?: string;
  variant?: ActionVariant;
  className?: string;
  name?: string;
  value?: string;
}) {
  const pending = use(ActionFormPendingContext);
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      aria-disabled={pending}
      className={actionClassName(variant, className)}
    >
      {pending ? (pendingLabel ?? "Working…") : children}
    </button>
  );
}
