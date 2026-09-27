"use client";

import { useState } from "react";

import { ActionForm } from "../action-form.client";
import type { ActionState } from "../action-state";
import { inputClassName } from "../action-styles";
import { Panel } from "../panel";
import { StatusLabel } from "../status-label";
import { SubmitButton } from "../submit-button.client";

import type { PhaseViewModel } from "./types";

// The review (research-phases.md R5–R8, R12). A review is the planner's own record that they read THIS
// output: it is not sign-off, not approval, and not a statement about the development. The form sends the
// fingerprint of the output on the page, so a review of an output that has since changed is refused (R7).
// A revision request needs a note; the form says so, and the database enforces it too (R6).
export function ReviewPanel({
  model,
  action,
}: {
  model: PhaseViewModel;
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [verdict, setVerdict] = useState<"reviewed" | "revision_requested">("reviewed");

  const latest = model.history[0];

  return (
    <Panel
      title="Your review"
      description="A review records that you read this output. It is not sign-off, and it says nothing about the development."
      actions={<StatusLabel tone={model.state.tone}>{model.state.text}</StatusLabel>}
    >
      {model.readOnly ? (
        <p className="text-sm text-muted">{model.readOnlyReason}</p>
      ) : model.output === null ? (
        <p className="text-sm text-muted">There is nothing to review yet.</p>
      ) : (
        <ActionForm action={action} className="flex flex-col gap-4">
          <input type="hidden" name="phase" value={model.phase} />
          <input type="hidden" name="expectedContentSha256" value={model.output.contentSha256} />
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold text-text">What do you want to record?</legend>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="verdict"
                value="reviewed"
                checked={verdict === "reviewed"}
                onChange={() => setVerdict("reviewed")}
                className="mt-1 accent-brand"
              />
              <span>
                <span className="font-medium">Reviewed.</span> I read this output as it is drafted above.
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="verdict"
                value="revision_requested"
                checked={verdict === "revision_requested"}
                onChange={() => setVerdict("revision_requested")}
                className="mt-1 accent-brand"
              />
              <span>
                <span className="font-medium">Request a revision.</span> This needs work: I will change an input above.
              </span>
            </label>
          </fieldset>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {verdict === "revision_requested" ? "What needs work (required)" : "Note (optional)"}
            <textarea
              name="note"
              rows={3}
              required={verdict === "revision_requested"}
              maxLength={2000}
              className={inputClassName}
              placeholder={verdict === "revision_requested" ? "Say what needs work, so you can find it again." : ""}
            />
          </label>
          <div>
            <SubmitButton pendingLabel="Recording…">
              Record review
            </SubmitButton>
          </div>
        </ActionForm>
      )}

      {latest ? (
        <p className="mt-4 border-t border-line pt-3 text-sm text-muted">
          Latest review: <span className="font-medium text-text">{latest.verdictText}</span> by {latest.by} on {latest.at}
          {latest.note ? <> — “{latest.note}”</> : null}.
        </p>
      ) : null}
    </Panel>
  );
}
