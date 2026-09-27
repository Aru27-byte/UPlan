import { SAMMAMISH_RESOURCE_TYPE_KEYS, type ProfileDocument } from "./schema";

// TechDesign/sample-data.md ("Out of scope: sample profiles"). A city's profile normally comes from an
// upload (F17) or a reviewed draft (F2). This is the ILLUSTRATIVE Sammamish profile the setup script
// proposes for a fresh database and the integration tests approve, so the sample project has rules to run
// under. Every citation says it was not verified against the current code; the one verified fact is the
// tree DBH thresholds from the charter's Pilot context. Never approve it in a real deployment.

const CAO_URL = "https://www.sammamish.us/projects/critical-areas-ordinance-cao-update/";
const TREES_URL = "https://www.sammamish.us/government/community-development/permit-center/trees/";
// Both reports are dated 2023-10-20 per the charter's Pilot context — the one real, verified date there
// is for anything in the Sammamish CAO update, used here rather than inventing an ordinance effective date.
const EFFECTIVE_ON = "2023-10-20";

function illustrativeCitation(topic: "critical-areas" | "trees") {
  return {
    codeSection:
      topic === "critical-areas"
        ? "SMC 21A (critical areas) — exact section not verified"
        : "SMC 21A.35 (trees) — exact section not verified",
    ordinance: null,
    sourceUrl: topic === "critical-areas" ? CAO_URL : TREES_URL,
  };
}

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

export function buildSampleProfileDocument(): ProfileDocument {
  const critical = illustrativeCitation("critical-areas");
  const trees = illustrativeCitation("trees");

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
  "Illustrative Sammamish profile for demonstration and local development. Every citation is marked as not verified against the current code; the tree DBH thresholds are the one fact verified in the charter's Pilot context.";
