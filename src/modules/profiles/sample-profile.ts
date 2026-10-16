import { SAMMAMISH_RESOURCE_TYPE_KEYS, type Citation, type ProfileDocument } from "./schema";

// TechDesign/sample-data.md ("Out of scope: sample profiles"). A city's profile normally comes from an
// upload (F17) or a reviewed draft (F2). This is the ILLUSTRATIVE profile the setup script proposes for a
// fresh database and the integration tests approve, so a project has rules to run under. It is built for
// Sammamish, Redmond, or Bellevue (TechDesign/jurisdiction-profile.md, "Illustrative profiles for several
// cities"); the three differ only in their citations. Every citation says it was not verified against the
// current code; the one verified fact is Sammamish's tree DBH thresholds from the charter's Pilot context,
// and Redmond's and Bellevue's citations say their figures are copied from the Sammamish sample. Never
// approve it in a real deployment.

export type SampleCityCode = { criticalAreas: Citation; trees: Citation };

const COPIED = "illustrative: section not verified, figures copied from the Sammamish sample";

export const SAMMAMISH_SAMPLE_CODE: SampleCityCode = {
  criticalAreas: {
    codeSection: "SMC 21A (critical areas) — exact section not verified",
    ordinance: null,
    sourceUrl: "https://www.sammamish.us/projects/critical-areas-ordinance-cao-update/",
  },
  trees: {
    codeSection: "SMC 21A.35 (trees) — exact section not verified",
    ordinance: null,
    sourceUrl: "https://www.sammamish.us/government/community-development/permit-center/trees/",
  },
};

export const REDMOND_SAMPLE_CODE: SampleCityCode = {
  criticalAreas: { codeSection: `RZC 21.64 (critical areas) — ${COPIED}`, ordinance: null, sourceUrl: "https://www.redmond.gov/" },
  trees: { codeSection: `RZC 21.72 (trees) — ${COPIED}`, ordinance: null, sourceUrl: "https://www.redmond.gov/" },
};

export const BELLEVUE_SAMPLE_CODE: SampleCityCode = {
  criticalAreas: { codeSection: `LUC 20.25H (critical areas) — ${COPIED}`, ordinance: null, sourceUrl: "https://bellevuewa.gov/" },
  trees: { codeSection: `LUC 20.20.900 (trees) — ${COPIED}`, ordinance: null, sourceUrl: "https://bellevuewa.gov/" },
};

// Both Sammamish reports are dated 2023-10-20 per the charter's Pilot context — the one real, verified date
// there is for anything in the Sammamish CAO update, used here rather than inventing an ordinance effective
// date. Redmond and Bellevue reuse it as a placeholder, which their citations' "illustrative" already says.
const EFFECTIVE_ON = "2023-10-20";

// Illustrative buffer widths (not cited to a verified SMC section). Two resource types
// (frequently-flooded-areas, critical-aquifer-recharge-areas) are regulated by elevation/zone rather than
// a fixed buffer in most WA CAOs, so they carry a study trigger only.
const BUFFER_WIDTHS_FT: Partial<Record<(typeof SAMMAMISH_RESOURCE_TYPE_KEYS)[number], number>> = {
  wetlands: 100,
  streams: 75,
  "geologically-hazardous-areas": 50,
  "habitat-conservation-areas": 100,
  "migration-corridors": 50,
};

export function buildSampleProfileDocument(code: SampleCityCode = SAMMAMISH_SAMPLE_CODE): ProfileDocument {
  const critical = code.criticalAreas;
  const trees = code.trees;

  const resourceTypes: ProfileDocument["resourceTypes"] = SAMMAMISH_RESOURCE_TYPE_KEYS.map((key) => ({
    key,
    label: key
      .split("-")
      .map((w) => (w[0]?.toUpperCase() ?? "") + w.slice(1))
      .join(" "),
    ruleSet: key === "forest-canopy" ? "trees" : "critical-areas",
    mapStatus: key === "wetlands" || key === "streams" ? "regulatory" : "approximate",
  }));

  const bufferRules: ProfileDocument["bufferRules"] = Object.entries(BUFFER_WIDTHS_FT).map(
    ([resourceType, widthFt]) => ({
      key: `${resourceType}-buffer`,
      resourceType,
      appliesWhen: null,
      widthFt: widthFt ?? 0,
      citation: critical,
      effectiveOn: EFFECTIVE_ON,
      repealedOn: null,
    }),
  );

  const studyTriggers: ProfileDocument["studyTriggers"] = SAMMAMISH_RESOURCE_TYPE_KEYS.filter(
    (k) => k !== "forest-canopy",
  ).map((resourceType) => ({
    key: `${resourceType}-study`,
    resourceType,
    study: resourceType === "geologically-hazardous-areas" ? "geotechnical-report" : "critical-area-study",
    withinFt: BUFFER_WIDTHS_FT[resourceType] ?? 0,
    citation: critical,
    effectiveOn: EFFECTIVE_ON,
    repealedOn: null,
  }));
  studyTriggers.push({
    key: "forest-canopy-study",
    resourceType: "forest-canopy",
    study: "arborist-report",
    withinFt: 0,
    citation: trees,
    effectiveOn: EFFECTIVE_ON,
    repealedOn: null,
  });

  // Charter, Pilot context: "Significant trees are conifers 8" DBH or larger and deciduous trees 12" DBH
  // or larger" — the one tree-rule fact verified against the city's own page. The removal cap's exact
  // count is not verified, so it is a clearly round, illustrative number.
  const treeRules: ProfileDocument["treeRules"] = [
    { kind: "significant-tree", key: "significant-conifer", group: "conifer", minDbhIn: 8, citation: trees, effectiveOn: EFFECTIVE_ON, repealedOn: null },
    { kind: "significant-tree", key: "significant-deciduous", group: "deciduous", minDbhIn: 12, citation: trees, effectiveOn: EFFECTIVE_ON, repealedOn: null },
    { kind: "removal-cap", key: "removal-cap-illustrative", maxCount: 3, periodYears: 10, citation: trees, effectiveOn: EFFECTIVE_ON, repealedOn: null },
  ];

  return {
    schemaVersion: 1,
    resourceTypes,
    bufferRules,
    studyTriggers,
    treeRules,
    settings: {
      // "Rules are always current" (charter, round 7) is the default until a planner marks an exception,
      // so both rule sets start non-vesting.
      vesting: [
        { ruleSet: "critical-areas", vests: false },
        { ruleSet: "trees", vests: false },
      ],
      retention: [
        { recordType: "decision", retainYears: 10, countFrom: "created" },
        { recordType: "report", retainYears: 10, countFrom: "report-released" },
        { recordType: "profile-change", retainYears: 10, countFrom: "created" },
        { recordType: "records-export", retainYears: 7, countFrom: "created" },
      ],
      exportFormats: ["pdf", "csv", "geojson"],
    },
  };
}

export const SAMPLE_PROFILE_REASON =
  "Illustrative profile for demonstration and local development. Every citation is marked as not verified against the current code; Sammamish's tree DBH thresholds are the one fact verified in the charter's Pilot context.";
