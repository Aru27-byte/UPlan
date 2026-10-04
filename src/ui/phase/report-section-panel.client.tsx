"use client";

import type { ReactNode } from "react";

import { ActionForm } from "../action-form.client";
import type { ActionState } from "../action-state";
import { inputClassName } from "../action-styles";
import { Icon } from "../icons";
import { SubmitButton } from "../submit-button.client";

import { GROUP_TONE, type StepGroup } from "./group-tones";

// The top of every step page except Report (research-phases.md R15): the section of the final document this
// step produces, shown as it will read in the document (`children`, rendered by the server from the same
// section components the document is stitched from), beside a box for feedback on that section's format or
// information. Feedback is a recorded note — the sentences are fixed templates, so nothing here rewrites the
// section (R2). The two halves sit side by side when the block itself is 48rem wide or more and stack below
// that: a container query, because the sidebar makes the viewport width a poor guide to the room the block
// has. Plain props only: src/ui imports no runtime code from @/modules.
export type ReportSectionModel = {
  step: string;
  group: StepGroup;
  stepTitle: string;
  feedback: { id: string; note: string; by: string; at: string }[];
  readOnly: boolean;
};

export function ReportSectionPanel({
  model,
  action,
  children,
}: {
  model: ReportSectionModel;
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  children: ReactNode;
}) {
  const tone = GROUP_TONE[model.group];
  const inputId = `feedback-${model.step}`;
  return (
    <section
      aria-label={`Report section produced by ${model.stepTitle}`}
      className="@container overflow-hidden rounded-xl border-2 border-cream/70 bg-surface text-text shadow-panel"
    >
      <div className="grid @3xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className={`flex min-w-0 flex-col gap-3 border-b-2 border-ink/20 px-5 py-4 text-ink @3xl:border-r-2 @3xl:border-b-0 ${tone.fill}`}>
          <p className="eyebrow flex items-center gap-1.5 text-ink/80">
            <Icon name="document" />
            Report section · from {model.stepTitle}
          </p>
          {children}
        </div>

        <div className="flex min-w-0 flex-col gap-3 px-5 py-4">
          {model.readOnly ? (
            <p className="text-sm text-muted">
              Feedback is closed while the document is completed or being generated. Start a research change to add more.
            </p>
          ) : (
            <ActionForm action={action} className="flex flex-col gap-3">
              <input type="hidden" name="step" value={model.step} />
              <label htmlFor={inputId} className="flex flex-col gap-1.5 text-sm font-semibold">
                Feedback on this section
                <textarea
                  id={inputId}
                  name="note"
                  rows={6}
                  required
                  maxLength={2000}
                  className={`${inputClassName} font-normal`}
                  placeholder="Say what to change about its format or what it shows."
                />
              </label>
              <p className="text-xs text-muted">Recorded with your name and the time. It doesn&apos;t change the section by itself.</p>
              <div>
                <SubmitButton pendingLabel="Saving…">Send feedback</SubmitButton>
              </div>
            </ActionForm>
          )}

          {model.feedback.length > 0 ? (
            <details className="border-t-2 border-line pt-3 text-sm">
              <summary className="cursor-pointer rounded font-medium text-brand">Earlier feedback ({model.feedback.length})</summary>
              <ul className="mt-2 flex flex-col gap-2">
                {model.feedback.map((entry) => (
                  <li key={entry.id} className="rounded-lg bg-canvas px-3 py-2">
                    <p className="text-text">“{entry.note}”</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {entry.by} · {entry.at}
                    </p>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      </div>
    </section>
  );
}
