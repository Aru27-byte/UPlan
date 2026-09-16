import { NextResponse } from "next/server";

import { checkHealth } from "@/modules/operations";

// TechDesign/system-architecture.md — W10 / "Health check and alarms". Answers 200, or 503 with
// only the names of the failing checks — never a stack trace, query text, or other internal detail.
export async function GET() {
  const result = await checkHealth();
  return NextResponse.json({ ok: result.ok, failing: result.failing }, { status: result.ok ? 200 : 503 });
}
