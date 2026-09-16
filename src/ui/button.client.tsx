"use client";

import { Button as AriaButton, type ButtonProps as AriaButtonProps } from "react-aria-components";

import { buttonClassName, type ButtonVariant } from "./button-styles";

// UIDesign/*.png — the gold "primary" action (Launch UPlan, New project, Release report), the
// green "secondary" action (Sign in, Check this site), and a plain outlined action (Upload site
// plan). Wraps react-aria-components' Button for its focus/press/disabled state handling rather
// than a bare <button> (tech-stack.md installs it for exactly this). This file is Client-only
// (RAC's Button uses context providers internally) — a Server Component that only needs the class
// string, not real press/focus behavior, should import buttonClassName from ./button-styles instead.
export type { ButtonVariant };

// `className` is narrowed to `string` here (react-aria-components also allows a function of render
// state, which this thin wrapper doesn't need to support) so it can be safely interpolated below.
export function Button({
  variant = "primary",
  className = "",
  ...props
}: Omit<AriaButtonProps, "className"> & { variant?: ButtonVariant; className?: string }) {
  return <AriaButton className={buttonClassName(variant, className)} {...props} />;
}
