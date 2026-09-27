import { describe, expect, it } from "vitest";

import { ForbiddenError } from "@/platform/errors";

import { requireStaff } from "./access";
import type { Actor } from "./actor";

function actorWith(overrides: Partial<Actor> = {}): Actor {
  return { userId: "u1", isStaff: false, ...overrides };
}

describe("R6/R7: a staff action is refused for anyone who isn't staff", () => {
  it("R7: throws ForbiddenError, not a generic error", () => {
    expect(() => requireStaff(actorWith())).toThrow(ForbiddenError);
    expect(() => requireStaff(actorWith())).toThrow("staff access required");
  });

  it("R6: passes for a staff actor", () => {
    expect(() => requireStaff(actorWith({ isStaff: true }))).not.toThrow();
  });
});

describe("R9: staff rights and project ownership never combine", () => {
  it("R9: requireStaff looks only at the staff flag, so owning a project grants nothing", () => {
    // The Actor type has no field an ownership check could set: a person who created projects is
    // still not staff.
    const planner = actorWith({ userId: "owner-of-many-projects" });
    expect(() => requireStaff(planner)).toThrow("staff access required");
  });
});
