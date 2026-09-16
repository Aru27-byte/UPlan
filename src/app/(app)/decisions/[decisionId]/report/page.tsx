import { getDecision } from "@/modules/decisions";
import { getLatestReportForDecision, releaseReport } from "@/modules/reports";

import { requireActor } from "@/app/_lib/actor";
import { buttonClassName } from "@/ui/button-styles";

// UIDesign/Project_View_Report.png — status banner, Release button, and (once released) a
// download link. A live in-browser preview before release isn't built: react-dom/server (needed
// to render the report document) can't be reached from anywhere in Next.js 16's app router build,
// route handlers included — see reports/index.ts's comment. That's a real, checked constraint, not
// an oversight; release the report to see the locked document.
export default async function ReportPage({ params }: { params: Promise<{ decisionId: string }> }) {
  const { decisionId } = await params;
  const { actor } = await requireActor();

  const decision = await getDecision(actor, decisionId);
  const latestReport = await getLatestReportForDecision(actor, decision.jurisdictionId, decisionId);

  async function releaseReportAction() {
    "use server";
    const { actor: releasingActor } = await requireActor();
    const d = await getDecision(releasingActor, decisionId);
    await releaseReport(releasingActor, decisionId, d.jurisdictionId);
  }

  const isReleased = latestReport?.status === "released";

  return (
    <div>
      <p className="text-ink/70 mb-4 text-sm">
        The document for the planning commission and council, built from the evidence and impact above. Once
        released, it&apos;s locked and can&apos;t be edited.
      </p>
      <div className="mb-4 flex items-center justify-between">
        <span className="badge">
          {isReleased
            ? "Released"
            : latestReport?.status === "releasing"
              ? "Releasing…"
              : "Draft — not released"}
        </span>
        {!isReleased ? (
          <form action={releaseReportAction}>
            <button type="submit" className={buttonClassName("primary", "text-ink")}>
              Release report
            </button>
          </form>
        ) : null}
      </div>
      {isReleased ? (
        <div className="card-sticker bg-white p-6">
          <p className="text-sm">
            This report was released and is locked. Its content never changes, even if the rules or evidence
            do later.
          </p>
          <a
            href={`/api/decisions/${decisionId}/report-download`}
            className={buttonClassName("secondary", "mt-4 inline-block text-ink")}
          >
            Download PDF
          </a>
        </div>
      ) : (
        <p className="text-ink/70 text-sm">
          A preview isn&apos;t shown before release in this build. Release the report to produce the locked
          document.
        </p>
      )}
    </div>
  );
}
