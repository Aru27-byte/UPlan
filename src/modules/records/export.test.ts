import { describe, expect, it } from "vitest";

import type { Actor } from "@/modules/accounts";

import { requestExport } from "./export";

const planner: Actor = { userId: "u1", isStaff: false };

describe("R5: an export request is checked before anything else", () => {
  it("requires staff before touching the profile or the database", async () => {
    // An export spans every person's records in the city, so it is a records-officer action
    // (accounts-roles.md R4: staff hold the rights that need a second pair of eyes).
    await expect(
      requestExport(planner, "j1", { recordTypes: ["decision"], from: null, to: null }, "pdf"),
    ).rejects.toThrow(/staff access required/);
  });
});
