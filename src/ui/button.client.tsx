"use client";

import { Button as AriaButton, type ButtonProps as AriaButtonProps } from "react-aria-components";

import { actionClassName, type ActionSize, type ActionVariant } from "./action-styles";

// A React Aria button, for a client form that wants its press, focus, and disabled handling (the sign-in and
// register forms, the landing showcase). It looks exactly like every other button: the class string is
// actionClassName's. A Server Component that only needs the look styles a plain element with actionClassName.
//
// `className` is narrowed to `string` here (react-aria-components also allows a function of render state, which
// this thin wrapper doesn't need) so it can be safely interpolated.
export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: Omit<AriaButtonProps, "className"> & { variant?: ActionVariant; size?: ActionSize; className?: string }) {
  return <AriaButton className={actionClassName(variant, `cursor-pointer ${className}`, size)} {...props} />;
}
