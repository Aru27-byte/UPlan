"use client";

import { useId, useRef, type ReactNode } from "react";

import { ActionForm } from "./action-form.client";
import type { ActionState } from "./action-state";
import { actionClassName, type ActionVariant } from "./action-styles";
import { SubmitButton } from "./submit-button.client";

// A confirmation over a native <dialog> (project-dashboard.md R5): the browser traps focus, closes on
// Escape, and returns focus to the button that opened it. Cancel takes focus first, so pressing Enter
// never confirms by accident. The confirm button is an ordinary submit over a Server Function, and an
// error it returns is shown inside the dialog, where the person is looking.
export function ConfirmDialog({
  triggerLabel,
  triggerAriaLabel,
  triggerVariant = "secondary",
  title,
  children,
  confirmLabel,
  pendingLabel,
  confirmVariant = "primary",
  action,
  fields = {},
  triggerClassName = "",
}: {
  triggerLabel: string;
  triggerAriaLabel?: string;
  triggerVariant?: ActionVariant;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  pendingLabel?: string;
  confirmVariant?: ActionVariant;
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  fields?: Record<string, string>;
  triggerClassName?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleId = useId(); // one per dialog: a page can hold several, and aria-labelledby must name its own

  return (
    <>
      <button
        type="button"
        aria-label={triggerAriaLabel}
        onClick={() => dialogRef.current?.showModal()}
        className={actionClassName(triggerVariant, triggerClassName)}
      >
        {triggerLabel}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-0 text-text shadow-panel backdrop:bg-black/40"
      >
        <ActionForm action={action} className="flex flex-col gap-4 p-6">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          <div className="text-sm text-muted">{children}</div>
          {Object.entries(fields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              autoFocus
              onClick={() => dialogRef.current?.close()}
              className={actionClassName("secondary")}
            >
              Cancel
            </button>
            <SubmitButton variant={confirmVariant} pendingLabel={pendingLabel}>
              {confirmLabel}
            </SubmitButton>
          </div>
        </ActionForm>
      </dialog>
    </>
  );
}
