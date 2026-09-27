"use client";

import { createContext, startTransition, useActionState, useEffect, useRef, type FormEvent, type ReactNode } from "react";

import type { ActionState } from "./action-state";

// Whether the enclosing ActionForm's request is in flight. SubmitButton reads it to disable itself and to say
// what it is doing (block double submission).
export const ActionFormPendingContext = createContext(false);

// A form over a Server Function (project-dashboard.md R10). An error the person can act on appears in a
// role="alert" region and a success notice in a role="status" region, so both are announced.
//
// React 19 resets an uncontrolled form after ANY function action, including one that returned an error, which
// would empty a required reason the person just typed. So the form submits through onSubmit instead: the
// fields keep what was typed when the action returns an error, and are cleared only after a success (a notice),
// when what was typed has been recorded. It holds no data access: the Server Function does all of that.
export function ActionForm({
  action,
  children,
  className = "",
  encType,
}: {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  children: ReactNode;
  className?: string;
  encType?: "multipart/form-data";
}) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(action, {});
  const formRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    if (state.notice) formRef.current?.reset();
  }, [state]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;
    const submitter = event.nativeEvent instanceof SubmitEvent ? event.nativeEvent.submitter : null;
    // The submitter is included so a button's own name and value (approve or reject) reach the action.
    const data = new FormData(event.currentTarget, submitter);
    startTransition(() => formAction(data));
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className={className} encType={encType}>
      <div aria-live="polite">
        {state.error ? (
          <p role="alert" className="mb-3 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
            {state.error}
          </p>
        ) : null}
        {state.notice ? (
          <p role="status" className="mb-3 rounded-lg border border-ok/30 bg-ok-soft px-3 py-2 text-sm font-medium text-ok">
            {state.notice}
          </p>
        ) : null}
      </div>
      <ActionFormPendingContext value={isPending}>{children}</ActionFormPendingContext>
    </form>
  );
}
