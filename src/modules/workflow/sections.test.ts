import { describe, expect, it } from "vitest";

import type { AnalysisResults } from "@/modules/analysis";
import { buildSampleProfileDocument, resolveRulesInForce } from "@/modules/profiles";

import { draftSite } from "./drafting";
import { derivePhaseOutputs, type PhaseFacts } from "./phases";
import {
  buildSectionViews,
  contentSha256,
  validateSectionContent,
  type SectionVersion,
} from "./sections";

// TechDesign/research-phases.md, "Section versions": a section's state is the comparison of its newest
// stored version's engine fingerprint with the current output's, and nothing here stores a state flag.

const rules = resolveRulesInForce(buildSampleProfileDocument(), "2026-09-27", null).rules;
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const emptyResults = (): AnalysisResults => ({
  impacts: [],
  evidenceBase: { disagreements: [], gaps: [] },
  screening: [],
  studyFlags: [],
  limits: [],
});

function facts(overrides: Partial<PhaseFacts> = {}): PhaseFacts {
  return {
    studyArea: { revision: 1, areaAcres: 18.44, sourceNote: "Traced from sheet C2.0", createdAt: new Date("2026-09-01T00:00:00Z") },
    footprint: { revision: 1, areaAcres: 6.1, sourceNote: "Traced from sheet C2.0", createdAt: new Date("2026-09-02T00:00:00Z") },
    status: { kind: "current", runId: "run-1" },
    run: { id: "run-1", results: emptyResults(), profileVersionId: "p1", profileVersionNumber: 2, datasetVersionIds: [A] },
    rules,
    resolvedFor: { "critical-areas": "2026-09-27", trees: "2026-09-27" },
    datasetTitles: new Map([[A, "Wetlands (county)"]]),
    datasetLimitations: new Map(),
    resolutions: [],
    ...overrides,
  };
}

function version(overrides: Partial<SectionVersion> = {}): SectionVersion {
  const f = facts();
  const output = derivePhaseOutputs(f).site;
  if (!output) throw new Error("the fixture has no site output");
  const content = draftSite(f.studyArea ?? { revision: 1, areaAcres: 1, sourceNote: "x", createdAt: new Date() });
  return {
    id: "v1",
    phase: "site",
    versionNumber: 1,
    source: "ai",
    content: { headline: content.headline, lines: content.lines, tables: [] },
    contentSha256: contentSha256({ headline: content.headline, lines: content.lines, tables: [] }),
    outputSha256: output.contentSha256,
    instruction: "Make the headline clearer.",
    sourceVersionNumber: null,
    createdByName: "Pat",
    createdAt: new Date("2026-09-10T00:00:00Z"),
    ...overrides,
  };
}

const viewOf = (views: ReturnType<typeof buildSectionViews>, phase: string) => views.find((v) => v.phase === phase);

describe("R5: a phase's section state is derived from its versions and the current output", () => {
  it("R5: with no stored version, a phase with output is Ready and shows the analysis draft", () => {
    const views = buildSectionViews(facts(), []);
    expect(views.map((v) => v.state.kind)).toEqual(Array(6).fill("ready"));
    const site = viewOf(views, "site");
    expect(site?.state).toMatchObject({ kind: "ready", version: null });
    expect(site?.versions).toEqual([]);
  });

  it("R5: a stored version whose engine fingerprint matches is Ready and is what the page shows", () => {
    const stored = version();
    const site = viewOf(buildSectionViews(facts(), [stored]), "site");
    expect(site?.state).toMatchObject({ kind: "ready", content: stored.content, version: stored });
  });

  it("R7: a stored version built on a different output is Out of date and never shown as current", () => {
    const stale = version({ outputSha256: "0".repeat(64), content: { headline: "Old headline", lines: ["Old line."], tables: [] } });
    const site = viewOf(buildSectionViews(facts(), [stale]), "site");
    expect(site?.state).toMatchObject({ kind: "out-of-date", version: stale, reason: "analysis-not-current" });
    expect(site?.changes?.removed).toContain("Old headline");
  });

  it("R10: the change summary compares the newest version with the one before it", () => {
    const older = version({ id: "v1", content: { headline: "Old headline", lines: ["Old line."], tables: [] } });
    const newest = version({ id: "v2", versionNumber: 2, content: { headline: "New headline", lines: ["New line."], tables: [] } });
    const site = viewOf(buildSectionViews(facts(), [newest, older]), "site");
    expect(site?.changes?.added).toEqual(["New headline", "New line."]);
    expect(site?.changes?.removed).toEqual(["Old headline", "Old line."]);
  });

  it("R4/R5: a phase without output is To do or Updating, with the reason", () => {
    const noFootprint = buildSectionViews(facts({ footprint: null }), []);
    expect(viewOf(noFootprint, "footprint")?.state).toEqual({ kind: "to-do", reason: "no-footprint", version: null });
    const notCurrent = buildSectionViews(facts({ status: { kind: "running", runId: "r" }, run: null, rules: null }), []);
    expect(viewOf(notCurrent, "evidence")?.state).toEqual({ kind: "updating", status: { kind: "running", runId: "r" }, version: null });
  });
});

describe("R7: stored section content is validated before it is written", () => {
  const draft = (): { headline: string; lines: string[]; tables: { key: string; caption: string | null; columnOrder: string[] }[] } => ({
    headline: "Screening results",
    lines: ["Wetlands are mapped in the study area."],
    tables: [{ key: "screening", caption: null, columnOrder: ["resourceType", "finding", "source", "confidence"] }],
  });

  it("R7: a reordered column list is accepted", () => {
    const content = draft();
    content.tables[0] = { key: "screening", caption: "Screening register", columnOrder: ["confidence", "source", "finding", "resourceType"] };
    expect(validateSectionContent("screening", content).tables[0]?.columnOrder).toEqual(["confidence", "source", "finding", "resourceType"]);
  });

  it("R7: dropping a provenance column is refused", () => {
    const content = draft();
    content.tables[0] = { key: "screening", caption: null, columnOrder: ["resourceType", "finding", "source"] };
    expect(() => validateSectionContent("screening", content)).toThrow(/keep every column/);
  });

  it("R7: a table the phase does not have is refused", () => {
    expect(() => validateSectionContent("site", draft())).toThrow(/no screening table/);
  });

  it("R6: a caption carrying a verdict is refused", () => {
    const content = draft();
    content.tables[0] = { key: "screening", caption: "The site is clear of wetlands.", columnOrder: ["resourceType", "finding", "source", "confidence"] };
    expect(() => validateSectionContent("screening", content)).toThrow(/verdict/);
  });

  it("R7: content hashing does not depend on key order", () => {
    const a = { headline: "h", lines: ["l"], tables: [] };
    const b = { tables: [], lines: ["l"], headline: "h" };
    expect(contentSha256(a)).toBe(contentSha256(b));
  });
});
