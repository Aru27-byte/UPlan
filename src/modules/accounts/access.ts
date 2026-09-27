import { ForbiddenError } from "@/platform/errors";

import type { Actor } from "./actor";

// TechDesign/accounts-roles.md — the whole of accounts' access API. Project access is ownership and
// lives in `decisions` (getDecision, lockEditableDecision), because it reads decision.created_by.
// The two paths never combine (R9); eslint.config.js's no-restricted-syntax rule keeps `requireStaff`
// from being OR'd with another check.
export function requireStaff(actor: Actor): void {
  if (!actor.isStaff) throw new ForbiddenError("staff access required");
}
