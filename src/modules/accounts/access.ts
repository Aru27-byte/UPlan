import { ForbiddenError } from "@/platform/errors";

import type { Actor, Role } from "./actor";

// TechDesign/accounts-roles.md — requireStaff and requireMembership read disjoint tables (via
// getActor) and are never combined with `||` anywhere in the codebase (R9); eslint.config.js's
// no-restricted-syntax rule keeps that true as new code is added.

export function requireMembership(actor: Actor, jurisdictionId: string, role?: Role): void {
  const has = actor.memberships.some(
    (m) => m.jurisdictionId === jurisdictionId && (role === undefined || m.role === role),
  );
  if (!has) throw new ForbiddenError(`no ${role ?? "membership"} access to this jurisdiction`);
}

export function requirePlanner(actor: Actor, jurisdictionId: string): void {
  requireMembership(actor, jurisdictionId, "planner");
}

export function requireReviewer(actor: Actor, jurisdictionId: string): void {
  requireMembership(actor, jurisdictionId, "reviewer");
}

export function requireStaff(actor: Actor): void {
  if (!actor.isStaff) throw new ForbiddenError("staff access required");
}
