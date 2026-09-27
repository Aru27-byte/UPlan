import { NextResponse } from "next/server";
import { z } from "zod";

import { requireActor } from "@/app/_lib/actor";
import type { Actor } from "@/modules/accounts";
import { getDocumentFile } from "@/modules/reports";
import { ForbiddenError, NotFoundError } from "@/platform/errors";

// F22 R12: returns the stored bytes of one published version, with their hash. The module function reaches the
// project through getDecision, so someone else's project, a deleted one, and one that never existed are all
// the same 404, and it recomputes the hash of what it read and refuses a mismatch instead of serving it.
const ParamsSchema = z.object({ projectId: z.uuid(), versionNumber: z.coerce.number().int().positive() });

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string; versionNumber: string }> }) {
  const parsed = ParamsSchema.safeParse(await params);
  if (!parsed.success) return new NextResponse("Not found", { status: 404 });

  let actor: Actor;
  try {
    ({ actor } = await requireActor());
  } catch (err) {
    if (err instanceof ForbiddenError) return new NextResponse("Sign in to download this document.", { status: 401 });
    throw err;
  }

  try {
    const file = await getDocumentFile(actor, parsed.data.projectId, parsed.data.versionNumber);
    return new NextResponse(new Uint8Array(file.bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${file.filename}"`,
        "X-Content-SHA256": file.sha256,
        // A private, per-person document: never stored by a shared cache.
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    if (err instanceof NotFoundError) return new NextResponse("Not found", { status: 404 });
    throw err;
  }
}
