import { eq } from "drizzle-orm";

import { listOpenDecisions } from "@/modules/decisions";
import { db } from "@/platform/db";
import { NotFoundError } from "@/platform/errors";
import { enqueueAnalysisRun } from "@/platform/jobs";

import { profileChange } from "./tables";

// The preview_profile_change job body (TechDesign/profile-upload-edit.md, R6). Each open decision
// gets a `purpose: "preview"` analysis run against the proposed document — the same impact engine
// (F9) a `current` run uses, so a reviewer sees real rule and impact differences before deciding.
export async function runPreview(changeId: string): Promise<void> {
  const [change] = await db.select().from(profileChange).where(eq(profileChange.id, changeId));
  if (!change) throw new NotFoundError("profile change");
  if (change.status !== "pending") return; // decided already; nothing to preview

  const openDecisions = await listOpenDecisions(change.jurisdictionId);
  for (const decision of openDecisions) {
    await enqueueAnalysisRun(decision.id, { purpose: "preview", profileChangeId: change.id });
  }
}
