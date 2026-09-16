import { NextResponse } from "next/server";

import { getDecision } from "@/modules/decisions";
import { downloadReport, getLatestReportForDecision } from "@/modules/reports";
import { ValidationError } from "@/platform/errors";

import { requireActor } from "@/app/_lib/actor";

// Safe to import through the module's index.ts, unlike the render pipeline (see reports/index.ts's
// comment): `downloadReport` only reads a row and fetches an object from storage — no
// `react-dom/server` anywhere in this path.
export async function GET(_request: Request, { params }: { params: Promise<{ decisionId: string }> }) {
  const { decisionId } = await params;
  const { actor } = await requireActor();
  const decision = await getDecision(actor, decisionId);

  const latestReport = await getLatestReportForDecision(actor, decision.jurisdictionId, decisionId);
  if (!latestReport) {
    return new NextResponse("no report has been released for this decision", { status: 404 });
  }

  try {
    const pdf = await downloadReport(actor, decision.jurisdictionId, latestReport.id);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${decisionId}-report.pdf"`,
      },
    });
  } catch (err) {
    if (err instanceof ValidationError) return new NextResponse(err.message, { status: 404 });
    throw err;
  }
}
