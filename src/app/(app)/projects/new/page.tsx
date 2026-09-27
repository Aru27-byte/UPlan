import Link from "next/link";

import { getCity } from "@/app/_lib/city";
import { APPLICATION_TYPE_LABEL } from "@/app/_lib/labels";
import { ActionForm } from "@/ui/action-form.client";
import { inputClassName } from "@/ui/action-styles";
import { PageHeader } from "@/ui/page-header";
import { Panel } from "@/ui/panel";
import { SubmitButton } from "@/ui/submit-button.client";

import { createProjectAction, createSampleProjectAction } from "../actions";

// TechDesign/project-dashboard.md R9: one short form. It asks for a title and an application type, and
// optionally the rest, none of which is required to begin. It names the city whose rules will apply, and
// offers to start with sample data (F23) as its own action, so a typed title is never silently discarded.
export default async function NewProjectPage() {
  const cityResult = await getCity();
  if (cityResult.kind !== "city") return null;
  const city = cityResult.city;

  return (
    <>
      <PageHeader
        title="New research"
        breadcrumb={[{ href: "/dashboard", label: "Dashboard" }]}
        meta={`The rules of ${city.name}, ${city.stateCode} apply to this project.`}
      />

      <Panel title="Project details" description="Only the title and the application type are required. Record the rest whenever you know it.">
        <ActionForm action={createProjectAction} className="grid max-w-3xl gap-4 sm:grid-cols-2">
          <input type="hidden" name="jurisdictionId" value={city.id} />
          <Field label="Title" required className="sm:col-span-2">
            <input name="title" required maxLength={200} autoComplete="off" className={inputClassName} placeholder="For example, Ridge Estates preliminary plat" />
          </Field>
          <Field label="Application type" required>
            <select name="applicationType" required defaultValue="subdivision" className={inputClassName}>
              {Object.entries(APPLICATION_TYPE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Parcel or address">
            <input name="parcelOrAddress" maxLength={300} autoComplete="off" className={inputClassName} />
          </Field>
          <Field label="Applicant">
            <input name="applicant" maxLength={300} autoComplete="off" className={inputClassName} />
          </Field>
          <Field label="Project manager">
            <input name="projectManager" maxLength={300} autoComplete="off" className={inputClassName} />
          </Field>
          <Field label="Application filed on" hint="Some rule sets use the rules in force on this date.">
            <input type="date" name="applicationFiledOn" className={inputClassName} />
          </Field>
          <Field label="Target decision date">
            <input type="date" name="targetDecisionOn" className={inputClassName} />
          </Field>
          <div className="flex flex-wrap gap-3 sm:col-span-2">
            <SubmitButton pendingLabel="Creating…">Create project</SubmitButton>
            <Link href="/dashboard" className="inline-flex min-h-10 items-center rounded-lg px-4 text-sm font-semibold text-muted hover:text-text">
              Cancel
            </Link>
          </div>
        </ActionForm>
      </Panel>

      <Panel
        title="Or start with sample data"
        description="A project with every phase's input filled in from a fictional site, so you can work through the whole workflow."
      >
        <ActionForm action={createSampleProjectAction}>
          <input type="hidden" name="jurisdictionId" value={city.id} />
          <SubmitButton variant="secondary" pendingLabel="Creating the sample project…">
            Start with sample data
          </SubmitButton>
        </ActionForm>
      </Panel>
    </>
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
