"use client";

import { useState } from "react";
import {
  Button as AriaButton,
  FieldError,
  Input,
  Label,
  Text,
  TextField as AriaTextField,
  type TextFieldProps,
} from "react-aria-components";

import { inputClassName } from "./action-styles";

// A labeled field for the sign-in and register forms (TechDesign/accounts-roles.md, R12): a visible
// label, an optional hint tied to the input, and an error message tied to it too — from native
// validation or from the server through the Form's `validationErrors`. A password field gets a
// Show/Hide toggle. The input is the same one every other form in UPlan uses (inputClassName).
export function TextField({
  label,
  hint,
  ...props
}: Omit<TextFieldProps, "className" | "children"> & { label: string; hint?: string }) {
  const [isRevealed, setIsRevealed] = useState(false);
  const isPassword = props.type === "password";

  return (
    <AriaTextField {...props} type={isPassword && isRevealed ? "text" : props.type} className="flex flex-col gap-1.5">
      <Label className="text-sm font-semibold text-text">{label}</Label>
      <div className="relative">
        <Input className={`${inputClassName} py-3 text-base ${isPassword ? "pr-20" : ""}`} />
        {isPassword ? (
          <AriaButton
            type="button"
            aria-pressed={isRevealed}
            aria-label={isRevealed ? "Hide password" : "Show password"}
            onPress={() => setIsRevealed((revealed) => !revealed)}
            className="absolute inset-y-1 right-1 flex cursor-pointer items-center rounded-lg px-3.5 text-sm font-semibold text-brand underline decoration-2 underline-offset-4 hover:bg-cream/[0.07]"
          >
            {isRevealed ? "Hide" : "Show"}
          </AriaButton>
        ) : null}
      </div>
      {hint ? (
        <Text slot="description" className="text-xs text-muted">
          {hint}
        </Text>
      ) : null}
      <FieldError className="message-in text-sm font-medium text-danger" />
    </AriaTextField>
  );
}
