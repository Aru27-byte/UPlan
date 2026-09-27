import type { Disagreement } from "@/modules/analysis";
import { ActionForm } from "@/ui/action-form.client";
import { inputClassName } from "@/ui/action-styles";
import { SubmitButton } from "@/ui/submit-button.client";

import { saveResolutionAction } from "../actions";

// F19 R7, R8, R10: records which source the planner relies on, and why. The revision it is based on rides
// along, so two saves of the same revision can't both succeed, and a note is saved as a new revision rather
// than edited. The form says the analysis is unchanged, because a resolution can look like a decision.
export function ResolutionForm({
  projectId,
  disagreement,
  mappedByTitle,
  notMappedByTitle,
  expectedRevision,
  isRevision,
}: {
  projectId: string;
  disagreement: Disagreement;
  mappedByTitle: string;
  notMappedByTitle: string;
  expectedRevision: number;
  isRevision: boolean;
}) {
  return (
    <ActionForm action={saveResolutionAction.bind(null, projectId)} className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
      <input type="hidden" name="resourceType" value={disagreement.resourceType} />
      <input type="hidden" name="mappedBy" value={disagreement.mappedBy} />
      <input type="hidden" name="notMappedBy" value={disagreement.notMappedBy} />
      <input type="hidden" name="expectedRevision" value={expectedRevision} />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-semibold text-text">
          {isRevision ? "Record a new revision of your reasoning" : "Record which source you rely on"}
        </legend>
        <label className="flex items-start gap-2">
          <input type="radio" name="reliedOn" value="mapped_by" required className="mt-1 accent-brand" />
          <span>{mappedByTitle}</span>
        </label>
        <label className="flex items-start gap-2">
          <input type="radio" name="reliedOn" value="not_mapped_by" className="mt-1 accent-brand" />
          <span>{notMappedByTitle}</span>
        </label>
        <label className="flex items-start gap-2">
          <input type="radio" name="reliedOn" value="neither" className="mt-1 accent-brand" />
          <span>Neither source</span>
        </label>
      </fieldset>
      <label className="flex flex-col gap-1.5 font-medium">
        Why (required)
        <textarea name="rationale" required rows={3} maxLength={2000} className={inputClassName} />
      </label>
      <p className="text-xs text-muted">
        This is your note. It changes no measurement, impact, or screening row, and it is stated in the final
        document beside both sources. It is asked about again if either dataset is replaced.
      </p>
      <div>
        <SubmitButton variant="secondary" pendingLabel="Recording…">
          {isRevision ? "Save new revision" : "Record reasoning"}
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
