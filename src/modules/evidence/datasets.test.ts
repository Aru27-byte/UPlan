import { describe, expect, it } from "vitest";

import type { Actor } from "@/modules/accounts";

import { createDataset } from "./datasets";

const staffActor: Actor = { userId: "staff-1", isStaff: true, memberships: [] };
const plannerActor: Actor = {
  userId: "planner-1",
  isStaff: false,
  memberships: [{ jurisdictionId: "j1", role: "planner" }],
};

const validInput = {
  key: "nwi-wetlands",
  title: "National Wetlands Inventory",
  publisher: "US Fish and Wildlife Service",
  license: "Public domain",
  sourceUrl: "https://www.fws.gov/wetlands/",
  coverage: { type: "MultiPolygon", coordinates: [] } as GeoJSON.Geometry,
  knownLimitation: null,
  confidenceDefault: "low" as const,
  confidenceRationaleDefault: "National-scale remote sensing, not field-verified.",
};

describe("R1: a dataset is only ingested from a free public source", () => {
  it("rejects a license not on the free-public allow-list", async () => {
    await expect(
      createDataset(staffActor, { ...validInput, license: "All rights reserved" }),
    ).rejects.toThrow(/not a recognized free public license/);
  });

  it("requires staff access, not just any actor", async () => {
    await expect(createDataset(plannerActor, validInput)).rejects.toThrow(/staff access required/);
  });
});
