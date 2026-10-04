import type { ReactNode } from "react";

import type { ProfileSource } from "@/modules/profiles";
import { formatTimestamp } from "@/modules/provenance";
import { ActionForm } from "@/ui/action-form.client";
import { actionClassName, inputClassName } from "@/ui/action-styles";
import { ConfirmDialog } from "@/ui/confirm-dialog.client";
import { Icon } from "@/ui/icons";
import { SubmitButton } from "@/ui/submit-button.client";

import { addExcelSourceAction, addUrlSourceAction, removeSourceAction, updateSourceAction } from "./actions";

// Where the city's rules come from: web pages UPlan reads, and Excel workbooks a planner uploaded (charter,
// "Uploaded and edited by planners"). The list is editable in place. A workbook applies the moment it is
// uploaded, so the view says so where the file is chosen.
export function SourcesView({
  jurisdictionId,
  versionId,
  sources,
  timeZone,
}: {
  jurisdictionId: string;
  versionId: string | null;
  sources: ProfileSource[];
  timeZone: string;
}) {
  const baseVersionId = versionId ?? "";
  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border-2 border-line bg-surface p-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-text">Excel template</h3>
          <p className="mt-0.5 text-xs text-muted">Fill it in with the city&apos;s rules, then upload it below. It is built from the same schema UPlan checks uploads against.</p>
        </div>
        <a href="/api/profile/template" className={actionClassName("secondary")}>
          <Icon name="download" />
          Download template
        </a>
      </section>

      <section aria-labelledby="source-list-heading">
        <h3 id="source-list-heading" className="mb-2 text-sm font-bold text-text">
          Current sources
        </h3>
        {sources.length === 0 ? (
          <p className="rounded-lg border-2 border-dashed border-line px-4 py-6 text-center text-sm text-muted">
            No source has been added yet. Add a web page or upload a workbook below.
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {sources.map((source) => (
              <SourceItem key={source.id} source={source} jurisdictionId={jurisdictionId} baseVersionId={baseVersionId} timeZone={timeZone} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="add-source-heading" className="flex flex-col gap-3">
        <h3 id="add-source-heading" className="text-sm font-bold text-text">
          Add a source
        </h3>

        <Card title="Web page" icon="link" description="A page of the city's code or ordinances.">
          <ActionForm action={addUrlSourceAction.bind(null, jurisdictionId)} className="flex flex-col gap-3">
            <Field label="Name">
              <input name="label" required maxLength={120} placeholder="Sammamish Municipal Code" className={inputClassName} />
            </Field>
            <Field label="Web address">
              <input name="url" type="url" required placeholder="https://" className={inputClassName} />
            </Field>
            <div>
              <SubmitButton variant="secondary" pendingLabel="Adding…">
                Add web page
              </SubmitButton>
            </div>
          </ActionForm>
        </Card>

        <Card title="Excel workbook" icon="spreadsheet" description="Use this when the city's website blocks automated reading, or to correct a rule.">
          <ActionForm action={addExcelSourceAction.bind(null, jurisdictionId)} encType="multipart/form-data" className="flex flex-col gap-3">
            <input type="hidden" name="baseVersionId" value={baseVersionId} />
            <Field label="Name">
              <input name="label" required maxLength={120} placeholder="Council code update, March" className={inputClassName} />
            </Field>
            <Field label="Workbook (.xlsx)">
              <input type="file" name="file" accept=".xlsx" required className={inputClassName} />
            </Field>
            <WorkbookWarning />
            <div>
              <SubmitButton pendingLabel="Applying…">Upload and apply</SubmitButton>
            </div>
          </ActionForm>
        </Card>
      </section>
    </div>
  );
}

function SourceItem({
  source,
  jurisdictionId,
  baseVersionId,
  timeZone,
}: {
  source: ProfileSource;
  jurisdictionId: string;
  baseVersionId: string;
  timeZone: string;
}) {
  const isWeb = source.kind === "url";
  // profile_source_url_shape guarantees a web source has an address; a row without one is a defect to surface.
  if (isWeb && source.url === null) throw new Error(`web source ${source.id} has no address`);
  return (
    <li className="flex items-start gap-2 rounded-lg border-2 border-line bg-surface p-3 has-[details[open]]:border-ink">
      <details className="group min-w-0 flex-1">
        <summary className="flex cursor-pointer list-none items-center gap-3 rounded [&::-webkit-details-marker]:hidden">
          <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${isWeb ? "bg-info-soft text-info" : "bg-brand-soft text-brand-strong"}`}>
            <Icon name={isWeb ? "link" : "spreadsheet"} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-text">{source.label}</span>
            <span className="block truncate text-xs text-muted">
              {isWeb ? source.url : `Excel workbook · uploaded ${formatTimestamp(source.createdAt, timeZone)}`}
            </span>
          </span>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand">
            <Icon name="pencil" />
            Edit
            <Icon name="chevron-down" className="transition-transform group-open:rotate-180" />
          </span>
        </summary>

        <ActionForm
          action={updateSourceAction.bind(null, jurisdictionId)}
          encType={isWeb ? undefined : "multipart/form-data"}
          className="mt-3 flex flex-col gap-3 border-t-2 border-line pt-3"
        >
          <input type="hidden" name="sourceId" value={source.id} />
          <input type="hidden" name="baseVersionId" value={baseVersionId} />
          <Field label="Name">
            <input name="label" required maxLength={120} defaultValue={source.label} className={inputClassName} />
          </Field>
          {isWeb ? (
            <>
              <Field label="Web address">
                <input name="url" type="url" required defaultValue={source.url ?? undefined} className={inputClassName} />
              </Field>
              <div>
                <SubmitButton variant="secondary" pendingLabel="Saving…">
                  Save source
                </SubmitButton>
              </div>
            </>
          ) : (
            <>
              <Field label="Replace workbook (optional)">
                <input type="file" name="file" accept=".xlsx" className={inputClassName} />
              </Field>
              <WorkbookWarning />
              <div>
                <SubmitButton variant="secondary" pendingLabel="Saving…">
                  Save source
                </SubmitButton>
              </div>
            </>
          )}
        </ActionForm>
      </details>

      <ConfirmDialog
        triggerLabel="Remove"
        triggerAriaLabel={`Remove ${source.label}`}
        triggerVariant="danger"
        triggerClassName="min-h-9 px-3 py-1.5"
        title={`Remove “${source.label}”?`}
        confirmLabel="Remove source"
        pendingLabel="Removing…"
        confirmVariant="danger"
        action={removeSourceAction.bind(null, jurisdictionId)}
        fields={{ sourceId: source.id }}
      >
        <p>It leaves this list only. Rules already in the profile stay as they are.</p>
      </ConfirmDialog>
    </li>
  );
}

function WorkbookWarning() {
  return (
    <p className="rounded-lg border border-warn/40 bg-warn-soft px-3 py-2 text-xs font-medium text-warn">
      A workbook applies as soon as it is uploaded. It replaces the profile&apos;s rules and settings with its own, and open projects are re-analyzed.
    </p>
  );
}

function Card({ title, icon, description, children }: { title: string; icon: "link" | "spreadsheet"; description: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border-2 border-line bg-surface p-4">
      <div className="mb-3 flex items-start gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-canvas text-text">
          <Icon name={icon} />
        </span>
        <div>
          <h4 className="text-sm font-bold text-text">{title}</h4>
          <p className="text-xs text-muted">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-text">
      {label}
      {children}
    </label>
  );
}
