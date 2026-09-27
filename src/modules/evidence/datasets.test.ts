import { describe, expect, it } from "vitest";

import type { Actor } from "@/modules/accounts";

import { createDataset, type NewDataset } from "./datasets";

const staffActor: Actor = { userId: "staff-1", isStaff: true };
const plannerActor: Actor = { userId: "planner-1", isStaff: false };

const validInput: NewDataset = {
  key: "nwi-wetlands",
  title: "National Wetlands Inventory",
  publisher: "US Fish and Wildlife Service",
  license: "Public domain",
  sourceUrl: "https://www.fws.gov/wetlands/",
  authority: "federal",
  spatialPrecision: "regional",
  coverage: { type: "MultiPolygon", coordinates: [] },
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

describe("R12: authority and spatial precision are required, and only from the allowed lists", () => {
  it("R12: a dataset without an authority is rejected before any write", async () => {
    const withoutAuthority = Object.fromEntries(Object.entries(validInput).filter(([key]) => key !== "authority"));
    await expect(createDataset(staffActor, withoutAuthority as NewDataset)).rejects.toThrow(/authority/);
  });

  it("R12: a spatial precision outside the list is rejected", async () => {
    await expect(
      createDataset(staffActor, { ...validInput, spatialPrecision: "approximate" } as unknown as NewDataset),
    ).rejects.toThrow(/spatialPrecision/);
  });
});
