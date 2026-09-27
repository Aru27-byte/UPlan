import { notFound } from "next/navigation";
import { cache } from "react";
import { z } from "zod";

import { requireActor, type SessionActor } from "@/app/_lib/actor";
import { getWorkflow, type Workflow } from "@/modules/workflow";
import { NotFoundError } from "@/platform/errors";

// The one way a project page reads its project. `cache` is React's per-request memo, not Next.js data
// caching (do-not.md): the layout and the page both call this in one request and share one read, and the
// next request reads the records afresh, so nothing is ever stale.
//
// Someone else's project, a deleted one, and one that never existed are all NotFoundError from the module
// (accounts-roles.md R7), and all become the same 404 here — a page never reveals which of the three it was.
export type LoadedProject = SessionActor & { projectId: string; workflow: Workflow };

const ProjectIdSchema = z.uuid();

export const loadProject = cache(async (projectId: string): Promise<LoadedProject> => {
  const parsed = ProjectIdSchema.safeParse(projectId);
  if (!parsed.success) notFound();
  const session = await requireActor();
  try {
    return { ...session, projectId: parsed.data, workflow: await getWorkflow(session.actor, parsed.data) };
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
});
