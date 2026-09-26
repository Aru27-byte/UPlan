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

// A labeled field for the sign-in and register forms (TechDesign/accounts-roles.md, R12): a visible
// label, an optional hint tied to the input, and an error message tied to it too — from native
// validation or from the server through the Form's `validationErrors`. A password field gets a
// Show/Hide toggle. The focus ring is a flat ink offset, matching the "sticker" cards.
export function TextField({
  label,
  hint,
  ...props
}: Omit<TextFieldProps, "className" | "children"> & { label: string; hint?: string }) {
  const [isRevealed, setIsRevealed] = useState(false);
  const isPassword = props.type === "password";

  return (
    <AriaTextField {...props} type={isPassword && isRevealed ? "text" : props.type} className="flex flex-col gap-1.5">
      <Label className="text-sm font-semibold">{label}</Label>
      <div className="relative">
        <Input
          className={`w-full rounded-lg border-2 border-ink bg-white px-4 py-3 text-base outline-2 outline-transparent transition-shadow data-[focused]:shadow-[3px_3px_0_0_var(--color-ink)] data-[invalid]:border-red-800 ${isPassword ? "pr-20" : ""}`}
        />
        {isPassword ? (
          <AriaButton
            type="button"
            aria-pressed={isRevealed}
            aria-label={isRevealed ? "Hide password" : "Show password"}
            onPress={() => setIsRevealed((revealed) => !revealed)}
            className="absolute inset-y-0 right-0 flex items-center rounded-r-lg px-4 text-sm font-semibold underline decoration-2 underline-offset-4 outline-2 outline-transparent data-[focus-visible]:bg-card-yellow"
          >
            {isRevealed ? "Hide" : "Show"}
          </AriaButton>
        ) : null}
      </div>
      {hint ? (
        <Text slot="description" className="text-xs text-ink/70">
          {hint}
        </Text>
      ) : null}
      <FieldError className="text-sm font-medium text-red-800" />
    </AriaTextField>
  );
}
