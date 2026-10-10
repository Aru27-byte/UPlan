import type { SourceDocumentSummary } from "@/modules/assist";
import { MAX_DOCUMENT_CHARS } from "@/modules/assist";
import { formatTimestamp } from "@/modules/provenance";
import { ActionForm } from "@/ui/action-form.client";
import { inputClassName } from "@/ui/action-styles";
import { Panel } from "@/ui/panel";
import { SubmitButton } from "@/ui/submit-button.client";

import { addSourceDocumentAction } from "./actions";

// The city's published code text and checklists that AI assist can quote (TechDesign/ai-assist.md, "Open
// items": on this hosting target the text is pasted by staff, because there is no worker to fetch and convert a
// PDF). Only public published text belongs here. A document is written once and never edited: a revised
// ordinance is added as a new document, and an old suggestion stays tied to the text it was made from.
export function CodeTextPanel({
  jurisdictionId,
  documents,
  timeZone,
  isStaff,
}: {
  jurisdictionId: string;
  documents: SourceDocumentSummary[];
  timeZone: string;
  isStaff: boolean;
}) {
  return (
    <Panel
      title="Code text for AI assist"
      description="Published code, ordinances, and checklists that AI assist can quote. Public text only: never an applicant's document."
    >
      {documents.length === 0 ? (
        <p className="mb-4 text-sm text-muted">No text has been added yet.</p>
      ) : (
        <ul className="mb-4 flex flex-col gap-1.5 text-sm">
          {documents.map((d) => (
            <li key={d.id} className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-line px-3 py-2">
              <span className="min-w-0 break-words font-medium text-text">{d.title}</span>
              <span className="text-xs text-muted">
                {d.kind === "code" ? "Code text" : "Checklist"} · {d.chunkCount} {d.chunkCount === 1 ? "section" : "sections"} · added{" "}
                {formatTimestamp(d.createdAt, timeZone)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {isStaff ? (
        <ActionForm action={addSourceDocumentAction.bind(null, jurisdictionId)} className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
            <div>
              <label htmlFor="doc-kind" className="mb-1 block text-xs font-semibold text-muted">
                Kind
              </label>
              <select id="doc-kind" name="kind" required className={inputClassName}>
                <option value="code">Code text</option>
                <option value="checklist">Permit checklist</option>
              </select>
            </div>
            <div>
              <label htmlFor="doc-title" className="mb-1 block text-xs font-semibold text-muted">
                Title
              </label>
              <input id="doc-title" name="title" required maxLength={200} className={inputClassName} placeholder="SMC 21A.50 Critical areas (as of 2026-10)" />
            </div>
          </div>
          <div>
            <label htmlFor="doc-text" className="mb-1 block text-xs font-semibold text-muted">
              Text (up to {MAX_DOCUMENT_CHARS.toLocaleString("en-US")} characters; add a long chapter in parts)
            </label>
            <textarea id="doc-text" name="text" required rows={10} className={inputClassName} />
          </div>
          <div>
            <SubmitButton pendingLabel="Indexing… this can take up to a minute">Add and index</SubmitButton>
          </div>
        </ActionForm>
      ) : (
        <p className="text-sm text-muted">UPlan staff add code text here.</p>
      )}
    </Panel>
  );
}
