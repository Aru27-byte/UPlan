import Link from "next/link";

import { getLatestRun } from "@/modules/analysis";
import { listDecisions, getGeometryAreaAcres } from "@/modules/decisions";
import { getJurisdiction } from "@/modules/profiles";
import { getLatestReportForDecision } from "@/modules/reports";

import { requireActor } from "@/app/_lib/actor";
import { buttonClassName } from "@/ui/button-styles";
import { DecisionStatusSchema, StatusPill } from "@/ui/page-header";
import { StatTile } from "@/ui/stat-tile";

const APPLICATION_TYPE_LABEL: Record<string, string> = {
  subdivision: "Subdivision",
  short_subdivision: "Short subdivision",
  clearing_grading: "Clearing and grading",
};

// UIDesign/Dashboard.png — "Current Research": stat tiles + a card per decision. Everything here
// is a real read from already-verified-membership data; nothing is fabricated (see the plan's
// "known gaps" note — there is no "Applicant" field on `decision`, so it's not shown).
export default async function DecisionsPage() {
  const { actor } = await requireActor();
  const firstMembership = actor.memberships[0];

  if (!firstMembership) {
    return (
      <p className="text-ink/70">
        You have no jurisdiction membership yet. Ask a UPlan staff member to grant you access.
      </p>
    );
  }

  const jurisdiction = await getJurisdiction(actor, firstMembership.jurisdictionId);
  const decisions = await listDecisions(actor, jurisdiction.id);

  const rows = await Promise.all(
    decisions.map(async (decision) => {
      const [areaAcres, latestRun, latestReport] = await Promise.all([
        getGeometryAreaAcres(actor, decision.id, "study_area", jurisdiction.analysisSrid),
        getLatestRun(decision.id, "current"),
        getLatestReportForDecision(actor, jurisdiction.id, decision.id),
      ]);
      return { decision, areaAcres, latestRun, latestReport };
    }),
  );

  const inProgressCount = decisions.filter((d) => d.status === "in_progress").length;
  const releasedCount = decisions.filter((d) => d.status === "report_released").length;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Current Research</h1>
        <Link href="/decisions/new" className={buttonClassName("primary", "text-ink")}>
          New project
        </Link>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile label="Total research" value={decisions.length} color="yellow" />
        <StatTile label="In progress" value={inProgressCount} color="green" />
        <StatTile label="Reports released" value={releasedCount} color="green" />
      </div>

      {rows.length === 0 ? (
        <p className="text-ink/70">No decisions yet. Start one with "New project".</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map(({ decision, areaAcres, latestRun, latestReport }) => (
            <li key={decision.id} className="card-sticker bg-white p-5">
              <Link
                href={`/decisions/${decision.id}/map`}
                className="flex items-center justify-between gap-4"
              >
                <div>
                  <h2 className="font-bold">{decision.title}</h2>
                  <p className="text-ink/70 mt-1 text-sm">
                    {APPLICATION_TYPE_LABEL[decision.applicationType] ?? decision.applicationType}
                    {decision.applicationFiledOn ? ` · Filed ${decision.applicationFiledOn}` : ""}
                    {areaAcres !== null ? ` · Study area: ${areaAcres.toFixed(1)} ac` : ""}
                  </p>
                  <p className="text-ink/60 mt-1 text-xs">
                    {latestRun ? "Evidence and impact complete" : "No analysis run yet"}
                    {latestReport
                      ? ` · Report ${latestReport.status === "released" ? "released" : "drafted"}`
                      : ""}
                  </p>
                </div>
                <StatusPill status={DecisionStatusSchema.parse(decision.status)} />
              </Link>
              <p className="text-ink/60 mt-2 text-xs">
                Profile:{" "}
                <Link href="/profile" className="hover:underline">
                  {jurisdiction.name}
                </Link>
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
