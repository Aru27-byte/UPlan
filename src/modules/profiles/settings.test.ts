import { describe, expect, it } from "vitest";

import { ValidationError } from "@/platform/errors";

import { buildSampleProfileDocument } from "./sample-profile";
import { applySettingsEdit, type SettingsEdit } from "./settings";

function editFor(overrides: Partial<SettingsEdit> = {}): SettingsEdit {
  const document = buildSampleProfileDocument();
  return {
    ...document.settings,
    mapStatus: Object.fromEntries(document.resourceTypes.map((r) => [r.key, r.mapStatus])),
    ...overrides,
  };
}

describe("applySettingsEdit", () => {
  it("R4: applies vesting, retention, export formats, and map status to the document", () => {
    const document = buildSampleProfileDocument();
    const [first] = document.resourceTypes;
    if (!first) throw new Error("the sample profile has no resource types");
    const flipped = first.mapStatus === "regulatory" ? "approximate" : "regulatory";

    const edited = applySettingsEdit(
      document,
      editFor({
        vesting: [
          { ruleSet: "critical-areas", vests: true },
          { ruleSet: "trees", vests: false },
        ],
        retention: document.settings.retention.map((r) => ({ ...r, retainYears: 3 })),
        exportFormats: ["xlsx"],
        mapStatus: { ...editFor().mapStatus, [first.key]: flipped },
      }),
    );

    expect(edited.settings.vesting.find((v) => v.ruleSet === "critical-areas")?.vests).toBe(true);
    expect(edited.settings.retention.every((r) => r.retainYears === 3)).toBe(true);
    expect(edited.settings.exportFormats).toEqual(["xlsx"]);
    expect(edited.resourceTypes.find((r) => r.key === first.key)?.mapStatus).toBe(flipped);
  });

  it("R4: leaves the rules untouched", () => {
    const document = buildSampleProfileDocument();
    const edited = applySettingsEdit(document, editFor());
    expect(edited.bufferRules).toEqual(document.bufferRules);
    expect(edited.studyTriggers).toEqual(document.studyTriggers);
    expect(edited.treeRules).toEqual(document.treeRules);
  });

  it("R4: refuses a map status for a resource type the profile does not have", () => {
    expect(() => applySettingsEdit(buildSampleProfileDocument(), editFor({ mapStatus: { ...editFor().mapStatus, "not-a-type": "regulatory" } }))).toThrow(
      ValidationError,
    );
  });

  it("R4: refuses an edit that leaves a resource type without a map status", () => {
    const { mapStatus } = editFor();
    const [firstKey] = Object.keys(mapStatus);
    if (!firstKey) throw new Error("the sample profile has no resource types");
    const rest = Object.fromEntries(Object.entries(mapStatus).filter(([key]) => key !== firstKey));
    expect(() => applySettingsEdit(buildSampleProfileDocument(), editFor({ mapStatus: rest }))).toThrow(ValidationError);
  });

  it("R4: refuses an edit with no export format", () => {
    expect(() => applySettingsEdit(buildSampleProfileDocument(), editFor({ exportFormats: [] }))).toThrow(ValidationError);
  });

  it("R4: refuses a retention list that omits a record type", () => {
    const document = buildSampleProfileDocument();
    expect(() => applySettingsEdit(document, editFor({ retention: document.settings.retention.slice(1) }))).toThrow(ValidationError);
  });
});
