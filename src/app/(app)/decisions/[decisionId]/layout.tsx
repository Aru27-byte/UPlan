import Link from "next/link";
import type { ReactNode } from "react";
import { z } from "zod";

import { getDecision, getGeometryAreaAcres, setFilingDate } from "@/modules/decisions";
import { getJurisdiction } from "@/modules/profiles";
import { ValidationError } from "@/platform/errors";

import { requireActor } from "@/app/_lib/actor";
import { buttonClassName } from "@/ui/button-styles";
import { DecisionStatusSchema, PageHeader } from "@/ui/page-header";

import { DecisionTabNav } from "./tab-nav.client";

const APPLICATION_TYPE_LABEL: Record<string, string> = {
  subdivision: "Subdivision",
  short_subdivision: "Short subdivision",
  clearing_grading: "Clearing and grading",
};

// R3 of Requirements/decisions.md: not required at creation, but a run against a vesting rule set
// needs it, so a planner must be able to record it from any tab, not just at creation.
const FilingDateFormSchema = z.object({
  decisionId: z.string().min(1),
  filedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "filing date must be YYYY-MM-DD"),
  expectedRowVersion: z.coerce.number().int().positive(),
});

async function setFilingDateAction(formData: FormData) {
  "use server";
  const { actor } = await requireActor();
  const parsed = FilingDateFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new ValidationError(parsed.error.issues.map((i) => i.message).join("; "));
  await setFilingDate(actor, parsed.data.decisionId, parsed.data.filedOn, parsed.data.expectedRowVersion);
}

// UIDesign/Project_View_*.png — the header (back link, title, meta, status) and tab bar shared by
// every Map/Evidence/Footprint/Impact/Report page. No Next.js data caching is used anywhere here
// (do-not.md forbids caching decisions/evidence/reports) — every render re-fetches.
export default async function DecisionLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ decisionId: string }>;
}) {
  const { decisionId } = await params;
  const { actor } = await requireActor();

  const decision = await getDecision(actor, decisionId);
  const jurisdiction = await getJurisdiction(actor, decision.jurisdictionId);
  const areaAcres = await getGeometryAreaAcres(actor, decisionId, "study_area", jurisdiction.analysisSrid);

  // Every fact this decision shows is judged under jurisdiction.name's rules (charter, "Core
  // object": "Every decision belongs to a city's profile... and is analyzed under that city's
  // rules and settings") — the meta line links straight to that profile, not just names it.
  const metaText = [
    APPLICATION_TYPE_LABEL[decision.applicationType] ?? decision.applicationType,
    decision.applicationFiledOn ? `Filed ${decision.applicationFiledOn}` : "Not yet filed",
    areaAcres !== null ? `Study area: ${areaAcres.toFixed(1)} ac` : "Study area: not yet drawn",
  ].join(" · ");
  const meta = (
    <>
      {metaText} · Profile:{" "}
      <Link href="/profile" className="hover:underline">
        {jurisdiction.name}
      </Link>
    </>
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        backHref="/decisions"
        backLabel="Current Research"
        title={decision.title}
        meta={meta}
        status={DecisionStatusSchema.parse(decision.status)}
        actions={
          <form action={setFilingDateAction} className="flex items-center gap-2">
            <input type="hidden" name="decisionId" value={decisionId} />
            <input type="hidden" name="expectedRowVersion" value={decision.rowVersion} />
            <label className="text-ink/70 flex items-center gap-2 text-xs font-medium">
              Filing date
              <input
                type="date"
                name="filedOn"
                required
                defaultValue={decision.applicationFiledOn ?? undefined}
                className="rounded-md border border-ink/30 px-2 py-1 text-sm"
              />
            </label>
            <button type="submit" className={buttonClassName("outline", "px-3 py-1.5 text-xs text-ink")}>
              {decision.applicationFiledOn ? "Update" : "Set"}
            </button>
          </form>
        }
      />
      <DecisionTabNav decisionId={decisionId} />
      {children}
    </div>
  );
}
