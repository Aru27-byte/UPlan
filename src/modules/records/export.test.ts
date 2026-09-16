import { describe, expect, it } from "vitest";

import type { Actor } from "@/modules/accounts";

import { requestExport } from "./export";

const bystander: Actor = { userId: "u1", isStaff: false, memberships: [] };

describe("R5: an export request is checked against the profile's allowed formats before anything else", () => {
  it("requires planner access before touching the profile or the database", async () => {
    await expect(
      requestExport(bystander, "j1", { recordTypes: ["decision"], from: null, to: null }, "pdf"),
    ).rejects.toThrow(/no planner access/);
  });
});
