import { APPLICATION_TYPE_LABEL, NOT_RECORDED, applicationTypeLabel } from "@/app/_lib/labels";
import type { Decision } from "@/modules/decisions";
import { ActionForm } from "@/ui/action-form.client";
import { inputClassName } from "@/ui/action-styles";
import { Panel } from "@/ui/panel";
import { SubmitButton } from "@/ui/submit-button.client";

import { loadSampleDetailsAction, saveDetailsAction } from "../actions";

// F5 R10–R12 / F18 R10: where the project's details are recorded and edited. A detail not yet recorded says
// so. The form carries the row version it was rendered from, so an edit made from an out-of-date page is
// rejected with a conflict rather than overwriting a newer one. Read-only unless the research is open.
export function DetailsPanel({
  projectId,
  decision,
  readOnly,
}: {
  projectId: string;
  decision: Decision;
  readOnly: boolean;
}) {
  const d = decision;
  const typeLabel = applicationTypeLabel(d.applicationType);
  const allBlank = [d.parcelOrAddress, d.applicant, d.projectManager, d.targetDecisionOn, d.applicationFiledOn].every(
    (value) => value === null,
  );

  if (readOnly) {
    return (
      <Panel id="details" title="Project details" description="Read-only while the project is completed or generating a document.">
        <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          <Fact label="Title" value={d.title} />
          <Fact label="Application type" value={typeLabel} />
          <Fact label="Parcel or address" value={d.parcelOrAddress} />
          <Fact label="Applicant" value={d.applicant} />
          <Fact label="Project manager" value={d.projectManager} />
          <Fact label="Application filed on" value={d.applicationFiledOn} />
          <Fact label="Target decision date" value={d.targetDecisionOn} />
          <Fact label="Permit number" value={d.permitNumber} />
        </dl>
      </Panel>
    );
  }

  return (
    <Panel
      id="details"
      title="Project details"
      description="Record what you know now and the rest later. A detail you leave blank stays “Not yet recorded”."
    >
      <div className="flex flex-col gap-5">
        <ActionForm action={saveDetailsAction.bind(null, projectId)} className="grid max-w-3xl gap-4 sm:grid-cols-2">
          <input type="hidden" name="rowVersion" value={d.rowVersion} />
          <Field label="Title" required className="sm:col-span-2">
            <input name="title" required maxLength={200} defaultValue={d.title} autoComplete="off" className={inputClassName} />
          </Field>
          <Field label="Application type" required>
            <select name="applicationType" required defaultValue={d.applicationType} className={inputClassName}>
              {Object.entries(APPLICATION_TYPE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Parcel or address">
            <input name="parcelOrAddress" maxLength={300} defaultValue={d.parcelOrAddress ?? ""} autoComplete="off" className={inputClassName} />
          </Field>
          <Field label="Applicant">
            <input name="applicant" maxLength={300} defaultValue={d.applicant ?? ""} autoComplete="off" className={inputClassName} />
          </Field>
          <Field label="Project manager">
            <input name="projectManager" maxLength={300} defaultValue={d.projectManager ?? ""} autoComplete="off" className={inputClassName} />
          </Field>
          <Field label="Application filed on" hint="Some rule sets use the rules in force on this date, and can't be analyzed without it.">
            <input type="date" name="applicationFiledOn" defaultValue={d.applicationFiledOn ?? ""} className={inputClassName} />
          </Field>
          <Field label="Target decision date">
            <input type="date" name="targetDecisionOn" defaultValue={d.targetDecisionOn ?? ""} className={inputClassName} />
          </Field>
          <div className="sm:col-span-2">
            <SubmitButton pendingLabel="Saving…">Save details</SubmitButton>
          </div>
        </ActionForm>

        {allBlank ? (
          <ActionForm action={loadSampleDetailsAction.bind(null, projectId)} className="border-t border-line pt-4">
            <input type="hidden" name="rowVersion" value={d.rowVersion} />
            <p className="mb-2 text-sm text-muted">
              Fill the address, applicant, manager, and dates from fictional sample data, to see the workflow without a
              real application. Offered only while these details are blank, so it never replaces real ones.
            </p>
            <SubmitButton variant="secondary" pendingLabel="Loading…">
              Load sample details
            </SubmitButton>
          </ActionForm>
        ) : null}
      </div>
    </Panel>
  );
}

function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className={value === null ? "text-muted" : "font-medium text-text"}>{value ?? NOT_RECORDED}</dd>
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  className = "",
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1.5 text-sm font-medium ${className}`}>
      <span>
        {label}
        {required ? <span className="text-danger"> *</span> : null}
      </span>
      {children}
      {hint ? <span className="text-xs font-normal text-muted">{hint}</span> : null}
    </label>
  );
}
