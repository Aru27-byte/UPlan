import { describe, expect, it } from "vitest";

import { requireMembership, requirePlanner, requireReviewer, requireStaff } from "./access";
import type { Actor } from "./actor";

const jurisdictionId = "j1";
const otherJurisdictionId = "j2";

function actorWith(overrides: Partial<Actor> = {}): Actor {
  return { userId: "u1", isStaff: false, memberships: [], ...overrides };
}

describe("R3: role and access are per jurisdiction, not global", () => {
  it("a planner membership for one jurisdiction grants nothing for another", () => {
    const actor = actorWith({ memberships: [{ jurisdictionId, role: "planner" }] });
    expect(() => requireMembership(actor, jurisdictionId)).not.toThrow();
    expect(() => requireMembership(actor, otherJurisdictionId)).toThrow("no membership access");
  });
});

describe("R6/R7: denied access is a distinguishable, safe failure", () => {
  it("throws ForbiddenError, not a generic error, for a missing membership", () => {
    const actor = actorWith();
    expect(() => requirePlanner(actor, jurisdictionId)).toThrowError(/no planner access/);
  });

  it("distinguishes planner from reviewer access", () => {
    const actor = actorWith({ memberships: [{ jurisdictionId, role: "reviewer" }] });
    expect(() => requireReviewer(actor, jurisdictionId)).not.toThrow();
    expect(() => requirePlanner(actor, jurisdictionId)).toThrow();
  });
});

describe("R9: staff rights and jurisdiction membership never cross", () => {
  it("a staff-only actor with no memberships still fails requireMembership", () => {
    const actor = actorWith({ isStaff: true, memberships: [] });
    expect(() => requireMembership(actor, jurisdictionId)).toThrow();
  });

  it("a jurisdiction member who isn't staff fails requireStaff", () => {
    const actor = actorWith({ memberships: [{ jurisdictionId, role: "planner" }] });
    expect(() => requireStaff(actor)).toThrow("staff access required");
  });
});
