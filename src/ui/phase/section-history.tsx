"use client";

import { ActionForm } from "../action-form.client";
import { ConfirmDialog } from "../confirm-dialog.client";
import { StatusLabel } from "../status-label";
import { SubmitButton } from "../submit-button.client";

import type { ReportSectionModel } from "./types";

// The section's history (research-phases.md R8–R10): every version, newest first, with its source, who, when,
// the instruction, and what changed. The current version has no Revert. Revert warns before it copies an
// earlier version's wording and figures; Update to current analysis is the only path from Out of date to Ready
// without a chat change, and it shows the draft it will store.
export function SectionChanges({ changes }: { changes: { added: string[]; removed: string[] } }) {
  if (changes.added.length === 0 && changes.removed.length === 0) {
    return <p className="mt-1 text-text">No sentence changed; a table&apos;s caption or column order did.</p>;
  }
  return (
    <>
      {changes.removed.length > 0 ? (
        <div className="mt-2">
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">No longer stated</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-text">
            {changes.removed.map((line, i) => (
              <li key={`r${i}:${line}`}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {changes.added.length > 0 ? (
        <div className="mt-2">
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">Now stated</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-text">
            {changes.added.map((line, i) => (
              <li key={`a${i}:${line}`}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}

export function SectionHistory({ model }: { model: ReportSectionModel }) {
  if (model.versions.length === 0 && !model.updateAction) return null;

  return (
    <details className="border-t border-line px-5 py-3 text-sm">
      <summary className="cursor-pointer font-medium text-brand">History ({model.versions.length})</summary>

      {model.updateAction && model.draft ? (
        <div className="mt-3 rounded-lg border border-warn/30 bg-warn-soft p-3">
          <p className="font-semibold text-warn">This section is out of date.</p>
          <p className="mt-1 text-text">
            The analysis has moved on. Updating stores the current analysis draft as a new version; the stored version stays in the history.
          </p>
          <div className="mt-2 rounded-lg border border-line bg-surface p-3">
            <p className="font-semibold text-text">{model.draft.headline}</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-text">
              {model.draft.lines.map((line, i) => (
                <li key={`${i}:${line}`}>{line}</li>
              ))}
            </ul>
          </div>
          <ActionForm action={model.updateAction} className="mt-3">
            <input type="hidden" name="phase" value={model.step} />
            <input type="hidden" name="expectedContentSha256" value={model.contentSha256 ?? ""} />
            <input type="hidden" name="expectedOutputSha256" value={model.outputSha256 ?? ""} />
            <SubmitButton pendingLabel="Updating…">Update to current analysis</SubmitButton>
          </ActionForm>
        </div>
      ) : null}

      {model.versions.length > 0 ? (
        <ol className="mt-3 flex flex-col gap-3">
          {model.versions.map((version) => (
            <li key={version.id} className="rounded-lg border border-line bg-canvas/40 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-text">
                    Version {version.versionNumber} <span className="font-normal text-muted">· {version.sourceText}</span>
                  </p>
                  <p className="text-xs text-muted">
                    {version.by} · {version.at}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {version.current ? <StatusLabel tone="ok">Current</StatusLabel> : null}
                  {!version.currentAnalysis ? <StatusLabel tone="warn">Earlier analysis</StatusLabel> : null}
                </div>
              </div>

              {version.instruction ? (
                <p className="mt-2 text-text">
                  <span className="font-semibold">Instruction: </span>
                  {version.instruction}
                </p>
              ) : null}

              {version.changes ? (
                <div className="mt-2">
                  <p className="font-semibold text-text">What changed</p>
                  <SectionChanges changes={version.changes} />
                </div>
              ) : null}

              {!version.current && model.revertAction && !model.readOnly && model.contentSha256 !== null && model.outputSha256 !== null ? (
                <div className="mt-3">
                  <ConfirmDialog
                    triggerLabel={`Revert to version ${version.versionNumber}`}
                    triggerAriaLabel={`Revert to version ${version.versionNumber}`}
                    triggerVariant="ghost"
                    title={`Revert to version ${version.versionNumber}?`}
                    confirmLabel={`Revert to version ${version.versionNumber}`}
                    pendingLabel="Reverting…"
                    action={model.revertAction}
                    fields={{
                      phase: model.step,
                      versionId: version.id,
                      expectedContentSha256: model.contentSha256,
                      expectedOutputSha256: model.outputSha256,
                    }}
                  >
                    <p>
                      This replaces the current wording with version {version.versionNumber}&apos;s. Version {version.versionNumber} stays in the history.
                    </p>
                    {!version.currentAnalysis ? (
                      <p className="mt-2">
                        Version {version.versionNumber} was built on an earlier analysis. The report cannot be generated until you update this section to the current analysis.
                      </p>
                    ) : null}
                  </ConfirmDialog>
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
    </details>
  );
}
