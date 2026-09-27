import { NextResponse } from "next/server";

import { requireActor } from "@/app/_lib/actor";
import { generateTemplate } from "@/modules/profiles";
import { ForbiddenError } from "@/platform/errors";

// profile-upload-edit.md R1: the Excel template, generated from the same schema that validates an upload, so it
// can't drift from what UPlan accepts. Any signed-in person may download it.
export async function GET() {
  try {
    await requireActor();
  } catch (err) {
    if (err instanceof ForbiddenError) return new NextResponse("Sign in to download the template.", { status: 401 });
    throw err;
  }
  const workbook = await generateTemplate();
  return new NextResponse(new Uint8Array(workbook), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="uplan-city-profile-template.xlsx"',
      "Cache-Control": "private, no-store",
    },
  });
}
