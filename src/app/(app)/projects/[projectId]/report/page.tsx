import Link from "next/link";

import { loadProject } from "@/app/_lib/project";
import { PHASE_TITLE, projectHref } from "@/app/_lib/workflow-labels";
import { getLatestAttempt } from "@/modules/reports";
import { formatCount, formatTimestamp } from "@/modules/provenance";
import { getFinishReadiness, type FinishReadiness } from "@/modules/workflow";
import { ActionForm } from "@/ui/action-form.client";
import { actionClassName, inputClassName } from "@/ui/action-styles";
import { DataTable } from "@/ui/data-table";
import { Icon } from "@/ui/icons";
import { Panel } from "@/ui/panel";
import { StatusLabel } from "@/ui/status-label";
import { SubmitButton } from "@/ui/submit-button.client";

import { finishResearchAction } from "../actions";

const BLOCKING_TEXT: Record<Exclude<FinishReadiness["blocking"][number]["key"], "phase-not-reviewed">, string> = {
  "analysis-not-current": "Wait for the analysis of the current inputs to finish.",
  "analysis-failed": "The analysis failed. Read its error on the Overview, then change an input or ask UPlan staff.",
  "filing-date-missing": "Record the application's filing date in the project details.",
  "nothing-changed": "Nothing has changed since the last published version. Change an input, or cancel the research change on the Overview.",
};

// The Report step (TechDesign/research-changes.md, locked-report.md): what finishing needs, the button that
// publishes the final document, and every version ever published. The document is generated in the
// background from the pinned run and the reviews (F22 R11), stored in UPlan's database with its hash, and
// never changed afterward (F10 R7). The readiness list here is advice: finishResearch decides, in one
// transaction, so a stale page can't cause a bad publication.
export default async function ReportPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { actor, workflow: w } = await loadProject(projectId);
  const d = w.decision;

  const [readiness, attempt] = await Promise.all([getFinishReadiness(actor, projectId), getLatestAttempt(actor, projectId)]);
  const isOpen = w.decisionStatus === "in_progress";
  const nextVersion = (w.latestVersion ?? 0) + 1;
  const needsReason = w.latestVersion !== null;
  const canFinish = readiness.blocking.length === 0;

  const statedText: Record<FinishReadiness["stated"][number]["key"], (count: number) => string> = {
    "evidence-gaps": (n) => `${formatCount(n, "resource type has", "resource types have")} no usable dataset over the study area.`,
    "source-disagreements": (n) => `${formatCount(n, "source disagreement is", "source disagreements are")} stated in the document.`,
    "approximate-boundaries": (n) => `${formatCount(n, "resource type has", "resource types have")} an approximate boundary that a site study sets.`,
    "desk-analysis-limits": (n) => `${formatCount(n, "limit of desk analysis is", "limits of desk analysis are")} stated in the document.`,
  };

  return (
    <div className="flex flex-col gap-6">
      {isOpen ? (
        <Panel
          title={w.latestVersion === null ? "Finish research" : `Publish version ${nextVersion}`}
          description="Finishing generates the final document: one PDF that UPlan stores, hashes, and never changes."
        >
          {attempt?.status === "failed" ? (
            <p role="alert" className="mb-4 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-text">
              <span className="font-semibold text-danger">The last attempt to generate the document failed.</span>{" "}
              {attempt.errorDetail ?? "No reason was recorded."} Nothing was published or numbered. You can try again.
            </p>
          ) : null}

          <h3 className="text-sm font-semibold text-text">Before finishing</h3>
          <ul className="mt-2 flex flex-col gap-1.5 text-sm">
            {readiness.blocking.length === 0 ? (
              <li className="flex items-start gap-2 text-text">
                <StatusLabel tone="ok">Ready</StatusLabel>
                <span>Every phase is reviewed and the analysis is current.</span>
              </li>
            ) : (
              readiness.blocking.map((item) => (
                <li key={`${item.key}:${item.phase ?? ""}`} className="flex items-start gap-2 text-text">
                  <StatusLabel tone="warn">To do</StatusLabel>
                  {item.key === "phase-not-reviewed" && item.phase ? (
                    <span>
                      Review the{" "}
                      <Link href={projectHref(projectId, item.phase)} className="font-medium text-brand underline underline-offset-2">
                        {PHASE_TITLE[item.phase]}
                      </Link>{" "}
                      phase.
                    </span>
                  ) : item.key === "phase-not-reviewed" ? null : (
                    <span>{BLOCKING_TEXT[item.key]}</span>
                  )}
                </li>
              ))
            )}
          </ul>

          {readiness.stated.length > 0 ? (
            <>
              <h3 className="mt-5 text-sm font-semibold text-text">What the document will state plainly</h3>
              <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm text-text">
                {readiness.stated.map((item) => (
                  <li key={item.key}>{statedText[item.key](item.count)}</li>
                ))}
              </ul>
            </>
          ) : null}

          <ActionForm action={finishResearchAction.bind(null, projectId)} className="mt-6 flex max-w-2xl flex-col gap-3 border-t border-line pt-5">
            <input type="hidden" name="rowVersion" value={d.rowVersion} />
            {needsReason ? (
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Reason for version {nextVersion} (required)
                <textarea
                  name="changeNote"
                  required
                  rows={3}
                  maxLength={1000}
                  className={inputClassName}
                  placeholder="Say what changed and why, for anyone reading the history."
                />
              </label>
            ) : null}
            <div className="flex flex-wrap items-center gap-3">
              <SubmitButton pendingLabel="Starting…">
                {w.latestVersion === null ? "Finish research and generate the document" : `Publish version ${nextVersion}`}
              </SubmitButton>
              {canFinish ? null : <span className="text-sm text-muted">The items above must be done first.</span>}
            </div>
          </ActionForm>
        </Panel>
      ) : null}

      {w.decisionStatus === "finishing" ? (
        <Panel title="Generating the document">
          <p role="status" className="text-sm text-text">
            The final document is being generated from the reviewed records. Nothing can change until it finishes. This
            page updates on its own.
          </p>
        </Panel>
      ) : null}

      <Panel
        title="Document versions"
        description="Every published version, newest first. A published version is never edited, replaced, or deleted."
      >
        {w.versions.length === 0 ? (
          <p className="text-sm text-muted">No version has been published yet.</p>
        ) : (
          <DataTable
            caption="Published document versions"
            columns={["Version", "Published", "What changed", "File"]}
            rows={w.versions.map((v) => ({
              key: v.reportId,
              cells: [
                <span key="v" className="flex flex-wrap items-center gap-2">
                  Version {v.versionNumber}
                  {v.isLatest ? <StatusLabel tone="ok">Latest</StatusLabel> : null}
                  {v.usesSampleData ? <StatusLabel tone="warn">Sample data</StatusLabel> : null}
                </span>,
                <div key="p" className="flex flex-col gap-0.5">
                  <span>{formatTimestamp(v.releasedAt, w.timeZone)}</span>
                  <span className="text-muted">by {v.publishedByName}</span>
                </div>,
                <div key="c" className="flex flex-col gap-1">
                  {v.previousVersion === null ? (
                    <span>First version.</span>
                  ) : (
                    <>
                      {v.changeNote ? <span>“{v.changeNote}”</span> : null}
                      <span className="text-muted">
                        Since version {v.previousVersion}:{" "}
                        {v.changedPhases.length === 0 && !v.detailsChanged
                          ? "no phase or detail changed."
                          : [...v.changedPhases.map((p) => PHASE_TITLE[p]), ...(v.detailsChanged ? ["Project details"] : [])].join(", ") + " changed."}
                      </span>
                    </>
                  )}
                </div>,
                <div key="f" className="flex flex-col items-start gap-1.5">
                  <a
                    href={`/api/projects/${projectId}/documents/${v.versionNumber}`}
 download
                    aria-label={`Download version ${v.versionNumber}`}
                    className={actionClassName("secondary", "min-h-8 px-3 py-1 text-xs")}
                  >
                    <Icon name="download" />
                    Download
                  </a>
                  <span className="text-xs text-muted">{Math.max(1, Math.round(v.sizeBytes / 1024))} KB</span>
                  <span className="text-xs break-all text-muted">SHA-256 {v.pdfSha256}</span>
                </div>,
              ],
            }))}
          />
        )}
      </Panel>
    </div>
  );
}

