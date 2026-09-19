// Local-dev bootstrap only — never run against a real deployment. Seeds:
//   1. a jurisdiction ("Sammamish") and one signed-in person's staff + planner access
//   2. a synthetic UPlan-staff reviewer account (profile_change_no_self_approval forbids a
//      person from approving their own proposed change, and only one real person signs in here)
//   3. an approved Sammamish profile (critical-area + tree rules), via the real proposeEdit/
//      decideChange flow — not a raw row insert
//   4. illustrative evidence datasets, one per SAMMAMISH_RESOURCE_TYPE_KEYS, mapped to the profile
//      — inserted directly via Drizzle (ogr2ogr/GDAL, which `ingestDataset` needs, isn't installed
//      on this machine; see TechDesign/alternatives-and-tradeoffs.md), and clearly marked as such
//      in every provenance field a planner or report would see
//   5. one demo decision with a saved study area and footprint, and a real computed analysis run
//
// Run after signing in once with GitHub (accounts-roles.md R2: a person must exist in app_user
// before any membership can be granted to them):
//
//   npx tsx --env-file=.env scripts/seed-local.ts you@example.com
import { randomUUID, createHash } from "node:crypto";

import { eq, and, sql } from "drizzle-orm";
import { runMigrations } from "graphile-worker";

import { appUser } from "../src/platform/auth-tables";
import { db, closeDb } from "../src/platform/db";
import { env } from "../src/platform/env";
import { membership, staffMember } from "../src/modules/accounts/tables";
import { getActor, type Actor } from "../src/modules/accounts";
import { jurisdiction } from "../src/modules/profiles/tables";
import {
  proposeEdit,
  decideChange,
  SAMMAMISH_RESOURCE_TYPE_KEYS,
  type ProfileDocument,
} from "../src/modules/profiles";
import { dataset, datasetVersion, evidenceFeature } from "../src/modules/evidence/tables";
import { createDataset, mapToJurisdiction } from "../src/modules/evidence";
import { decision } from "../src/modules/decisions/tables";
import { createDecision, saveGeometry, setFilingDate } from "../src/modules/decisions";
import { runAnalysis } from "../src/modules/analysis";

const SAMMAMISH_BOUNDARY = {
  type: "MultiPolygon" as const,
  // A rough bounding box, not a surveyed boundary — good enough to satisfy the NOT NULL column
  // for local development; real profile setup would use the city's actual boundary.
  coordinates: [
    [
      [
        [-122.06, 47.55],
        [-121.96, 47.55],
        [-121.96, 47.65],
        [-122.06, 47.65],
        [-122.06, 47.55],
      ],
    ],
  ],
};

const CAO_URL = "https://www.sammamish.us/projects/critical-areas-ordinance-cao-update/";
const TREES_URL = "https://www.sammamish.us/government/community-development/permit-center/trees/";
// Both reports are dated 2023-10-20 per the charter's Pilot context — the one real, verified date
// this session has for anything in the Sammamish CAO update, used here rather than inventing an
// ordinance effective date this session hasn't verified.
const CAO_EFFECTIVE_ON = "2023-10-20";

function illustrativeCitation(topic: "critical-areas" | "trees") {
  return {
    codeSection:
      topic === "critical-areas"
        ? "SMC 21A (critical areas) — exact section not verified this session"
        : "SMC 21A.35 (trees) — exact section not verified this session",
    ordinance: null,
    sourceUrl: topic === "critical-areas" ? CAO_URL : TREES_URL,
  };
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

async function ensureJurisdiction(): Promise<{
  id: string;
  name: string;
  currentProfileVersionId: string | null;
}> {
  let [existing] = await db
    .select({
      id: jurisdiction.id,
      name: jurisdiction.name,
      currentProfileVersionId: jurisdiction.currentProfileVersionId,
    })
    .from(jurisdiction)
    .where(eq(jurisdiction.name, "Sammamish"));
  if (!existing) {
    const [created] = await db
      .insert(jurisdiction)
      .values({
        name: "Sammamish",
        stateCode: "WA",
        timeZone: "America/Los_Angeles",
        analysisSrid: 2926,
        boundary: SAMMAMISH_BOUNDARY,
      })
      .returning({
        id: jurisdiction.id,
        name: jurisdiction.name,
        currentProfileVersionId: jurisdiction.currentProfileVersionId,
      });
    existing = created;
    console.log(`created jurisdiction "Sammamish" (${created?.id})`);
  } else {
    console.log(`jurisdiction "Sammamish" already exists (${existing.id})`);
  }
  if (!existing) throw new Error("jurisdiction lookup/creation unexpectedly produced nothing");
  return existing;
}

async function ensureReviewerUser(): Promise<{ id: string }> {
  const email = "uplan-review-bot@uplan.local";
  const [existing] = await db.select({ id: appUser.id }).from(appUser).where(eq(appUser.email, email));
  if (existing) return existing;
  const [created] = await db
    .insert(appUser)
    .values({
      id: randomUUID(),
      name: "UPlan review bot (seed)",
      email,
      emailVerified: true,
    })
    .returning({ id: appUser.id });
  if (!created) throw new Error("insert into app_user unexpectedly returned no row");
  console.log(
    `created synthetic reviewer account ${email} (${created.id}) — used only to approve seeded profile changes, never signs in`,
  );
  return created;
}

// R3 of profile-upload-edit.md's approval flow needs a second, distinct person: the DB constraint
// profile_change_no_self_approval forbids decided_by = proposed_by, and only one real person signs
// in on a local dev box, so the reviewer bot exists purely to satisfy that separation for seeding.
async function ensureSammamishProfile(
  jurisdictionId: string,
  plannerActor: Actor,
  reviewerActor: Actor,
): Promise<void> {
  const critical = illustrativeCitation("critical-areas");
  const trees = illustrativeCitation("trees");

  const resourceTypes: ProfileDocument["resourceTypes"] = SAMMAMISH_RESOURCE_TYPE_KEYS.map((key) => ({
    key,
    label: key
      .split("-")
      .map((w) => w[0]?.toUpperCase() + w.slice(1))
      .join(" "),
    ruleSet: key === "forest-canopy" ? "trees" : "critical-areas",
    mapStatus: key === "wetlands" || key === "streams" ? "regulatory" : "approximate",
  }));

  // Illustrative buffer widths (not cited to a verified SMC section — see illustrativeCitation).
  // Two resource types (frequently-flooded-areas, critical-aquifer-recharge-areas) are regulated by
  // elevation/zone rather than a fixed buffer in most WA CAOs, so they carry a study trigger only.
  const bufferWidths: Partial<Record<(typeof SAMMAMISH_RESOURCE_TYPE_KEYS)[number], number>> = {
    wetlands: 100,
    streams: 75,
    "geologically-hazardous-areas": 50,
    "habitat-conservation-areas": 100,
    "migration-corridors": 50,
  };

  const bufferRules: ProfileDocument["bufferRules"] = Object.entries(bufferWidths).map(
    ([resourceType, widthFt]) => ({
      key: `${resourceType}-buffer`,
      resourceType,
      appliesWhen: null,
      widthFt: widthFt ?? 0,
      citation: critical,
      effectiveOn: CAO_EFFECTIVE_ON,
      repealedOn: null,
    }),
  );

  const studyTriggers: ProfileDocument["studyTriggers"] = SAMMAMISH_RESOURCE_TYPE_KEYS.filter(
    (k) => k !== "forest-canopy",
  ).map((resourceType) => ({
    key: `${resourceType}-study`,
    resourceType,
    study: resourceType === "geologically-hazardous-areas" ? "geotechnical-report" : "critical-area-study",
    withinFt: bufferWidths[resourceType] ?? 0,
    citation: critical,
    effectiveOn: CAO_EFFECTIVE_ON,
    repealedOn: null,
  }));
  studyTriggers.push({
    key: "forest-canopy-study",
    resourceType: "forest-canopy",
    study: "arborist-report",
    withinFt: 0,
    citation: trees,
    effectiveOn: CAO_EFFECTIVE_ON,
    repealedOn: null,
  });

  // Charter, Pilot context: "Significant trees are conifers 8" DBH or larger and deciduous trees
  // 12" DBH or larger" — the one tree-rule fact this session has verified against the city's own
  // page; the removal cap's exact count is not verified, so it's a clearly round, illustrative number.
  const treeRules: ProfileDocument["treeRules"] = [
    {
      kind: "significant-tree",
      key: "significant-conifer",
      group: "conifer",
      minDbhIn: 8,
      citation: trees,
      effectiveOn: CAO_EFFECTIVE_ON,
      repealedOn: null,
    },
    {
      kind: "significant-tree",
      key: "significant-deciduous",
      group: "deciduous",
      minDbhIn: 12,
      citation: trees,
      effectiveOn: CAO_EFFECTIVE_ON,
      repealedOn: null,
    },
    {
      kind: "removal-cap",
      key: "removal-cap-illustrative",
      maxCount: 3,
      periodYears: 10,
      citation: trees,
      effectiveOn: CAO_EFFECTIVE_ON,
      repealedOn: null,
    },
  ];

  const document: ProfileDocument = {
    schemaVersion: 1,
    resourceTypes,
    bufferRules,
    studyTriggers,
    treeRules,
    settings: {
      // "Rules are always current" (charter, round 7) is the default until a planner marks an
      // exception, so both rule sets start non-vesting.
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

  const change = await proposeEdit(
    plannerActor,
    jurisdictionId,
    document,
    "Seed: illustrative Sammamish profile for local development — see charter Pilot context for the one verified fact (tree DBH thresholds); every citation is marked as not verified against the current code.",
  );
  await decideChange(reviewerActor, change.id, "approved", "Seed: auto-approved for local development.");
  console.log(`approved profile version for Sammamish (change ${change.id})`);
}

type EvidenceSeed = {
  key: (typeof SAMMAMISH_RESOURCE_TYPE_KEYS)[number];
  /** Defaults to `sammamish-${key}-illustrative` — set only when a resource type has more than one dataset. */
  datasetKey?: string;
  title: string;
  sourceUrl: string;
  knownLimitation: string | null;
  feature: GeoJSON.Geometry;
};

// Small, hand-placed shapes inside DEMO_STUDY_AREA below, chosen to exercise every part of the
// Evidence/Impact tabs, not just show a dot on the map:
//  - wetlands sits inside DEMO_FOOTPRINT (a direct impact) and has a SECOND, disagreeing dataset
//    (wetlands-alt) whose extent only partly overlaps the first — a real R3 disagreement
//    (evidence-base.ts), not a fabricated one.
//  - streams, geologically-hazardous-areas, habitat-conservation-areas, and migration-corridors
//    each sit inside or within their profile buffer width of the footprint, so the Impact tab
//    shows real direct AND buffer impacts across most resource types, computed by PostGIS.
//  - frequently-flooded-areas and forest-canopy sit inside the study area but away from the
//    footprint, so they show real evidence with zero impact — an honest "no impact here" fact.
//  - critical-aquifer-recharge-areas has no entry at all: a genuine, uncontrived "no dataset
//    mapped" gap (evidence-base.ts R4), not a fake empty state.
const EVIDENCE_SEEDS: EvidenceSeed[] = [
  {
    key: "wetlands",
    title: "Wetlands (illustrative)",
    sourceUrl: CAO_URL,
    knownLimitation: null,
    feature: {
      type: "Polygon",
      coordinates: [
        [
          [-122.015, 47.598],
          [-122.005, 47.598],
          [-122.005, 47.604],
          [-122.015, 47.604],
          [-122.015, 47.598],
        ],
      ],
    },
  },
  {
    key: "wetlands",
    datasetKey: "sammamish-wetlands-alt-illustrative",
    title: "Wetlands, alternate source (illustrative)",
    sourceUrl: CAO_URL,
    knownLimitation: null,
    // Shifted 0.005° west of the primary wetlands feature, same lat range: a partial overlap
    // (agreement in the middle, disagreement on the two outer slivers) rather than a full match.
    feature: {
      type: "Polygon",
      coordinates: [
        [
          [-122.02, 47.598],
          [-122.01, 47.598],
          [-122.01, 47.604],
          [-122.02, 47.604],
          [-122.02, 47.598],
        ],
      ],
    },
  },
  {
    key: "streams",
    title: "Streams (illustrative)",
    sourceUrl: CAO_URL,
    knownLimitation: null,
    feature: {
      type: "LineString",
      coordinates: [
        [-122.0201, 47.6],
        [-122.0201, 47.61],
      ],
    },
  },
  {
    key: "frequently-flooded-areas",
    title: "Frequently flooded areas (illustrative)",
    sourceUrl: CAO_URL,
    knownLimitation: null,
    feature: {
      type: "Polygon",
      coordinates: [
        [
          [-121.998, 47.6],
          [-121.994, 47.6],
          [-121.994, 47.604],
          [-121.998, 47.604],
          [-121.998, 47.6],
        ],
      ],
    },
  },
  {
    key: "geologically-hazardous-areas",
    title: "Geologically hazardous areas (illustrative)",
    sourceUrl: CAO_URL,
    knownLimitation: null,
    // Straddles the footprint's north edge (lat 47.61): a real direct impact, not just a buffer.
    feature: {
      type: "Polygon",
      coordinates: [
        [
          [-122.015, 47.605],
          [-122.005, 47.605],
          [-122.005, 47.615],
          [-122.015, 47.615],
          [-122.015, 47.605],
        ],
      ],
    },
  },
  {
    key: "habitat-conservation-areas",
    title: "Habitat conservation areas (illustrative)",
    sourceUrl: CAO_URL,
    knownLimitation: null,
    // ~25ft east of the footprint's east edge (lon -122.00) — within its 100ft buffer.
    feature: {
      type: "Polygon",
      coordinates: [
        [
          [-121.9999, 47.6],
          [-121.996, 47.6],
          [-121.996, 47.605],
          [-121.9999, 47.605],
          [-121.9999, 47.6],
        ],
      ],
    },
  },
  {
    key: "migration-corridors",
    title: "Migration corridors (illustrative)",
    sourceUrl: CAO_URL,
    knownLimitation: null,
    // ~35ft south of the footprint's south edge (lat 47.595) — within its 50ft buffer.
    feature: {
      type: "LineString",
      coordinates: [
        [-122.03, 47.5949],
        [-121.99, 47.5949],
      ],
    },
  },
  {
    key: "forest-canopy",
    title: "Forest canopy extent (illustrative)",
    sourceUrl: TREES_URL,
    knownLimitation:
      'Canopy extent only, from remote sensing — individual trunk diameters cannot be determined from this data (charter: "Known limits of desk analysis").',
    feature: {
      type: "Polygon",
      coordinates: [
        [
          [-122.028, 47.606],
          [-122.022, 47.606],
          [-122.022, 47.612],
          [-122.028, 47.612],
          [-122.028, 47.606],
        ],
      ],
    },
  },
];

// This script is local-dev fixture data, never a real deployment (see the file header) — unlike
// do-not.md's ban on updating or deleting real evidence/analysis history, wiping and recreating
// this script's OWN illustrative rows on every run (rather than the previous per-dataset
// skip-if-exists idempotency) is what actually lets the seeded scenario evolve as this script
// does, instead of permanently freezing whatever an earlier version of it happened to insert
// first. Scoped strictly by this script's own "sammamish-*-illustrative" key convention, so it
// can never touch a real dataset.
async function resetIllustrativeEvidence(): Promise<void> {
  const datasetIdRows = await db
    .execute<{ id: string }>(sql`select id from dataset where key like 'sammamish-%-illustrative'`)
    .then((r) => r.rows);
  const datasetIds = datasetIdRows.map((r) => r.id);
  if (datasetIds.length === 0) return;

  // analysis_run itself is left alone — a real historical record even for a demo decision, and
  // runAnalysis's own R8 input-pinning naturally computes a fresh run once the dataset versions
  // below change, which getLatestRun then picks up as the new latest. Only the FK from
  // analysis_run_dataset to the dataset_version rows being deleted needs clearing first.
  await db.execute(sql`
    delete from analysis_run_dataset
    where dataset_version_id in (select id from dataset_version where dataset_id in ${datasetIds})
  `);
  await db.execute(sql`
    delete from evidence_feature
    where dataset_version_id in (select id from dataset_version where dataset_id in ${datasetIds})
  `);
  await db.execute(sql`delete from jurisdiction_dataset where dataset_id in ${datasetIds}`);
  await db.execute(sql`update dataset set current_version_id = null where id in ${datasetIds}`);
  await db.execute(sql`delete from dataset_version where dataset_id in ${datasetIds}`);
  await db.execute(sql`delete from dataset where id in ${datasetIds}`);
  console.log(`cleared ${datasetIds.length} previously seeded illustrative dataset(s) for a clean reseed`);
}

async function ensureEvidenceDataset(
  jurisdictionId: string,
  staffActor: Actor,
  seed: EvidenceSeed,
): Promise<void> {
  const datasetKey = seed.datasetKey ?? `sammamish-${seed.key}-illustrative`;
  const [existing] = await db.select({ id: dataset.id }).from(dataset).where(eq(dataset.key, datasetKey));
  if (existing) {
    console.log(`dataset "${datasetKey}" already exists — skipping`);
    return;
  }

  const created = await createDataset(staffActor, {
    key: datasetKey,
    title: seed.title,
    publisher: "City of Sammamish (illustrative test data)",
    license: "Public domain",
    sourceUrl: seed.sourceUrl,
    coverage: SAMMAMISH_BOUNDARY,
    knownLimitation: seed.knownLimitation,
    confidenceDefault: "moderate",
    confidenceRationaleDefault:
      "Illustrative test data seeded for local development — not a real ingested dataset. Do not use this figure or its rationale in an actual decision.",
  });

  const rawSha256 = sha256(datasetKey);
  const [version] = await db
    .insert(datasetVersion)
    .values({
      datasetId: created.id,
      status: "ready",
      rawObjectKey: `evidence-raw/seed/${datasetKey}.geojson`,
      rawSha256,
      retrievedAt: new Date(),
      sourceAsOf: null,
      sourceAsOfNote: "Illustrative test data seeded for local development — not a real publisher release.",
      confidence: created.confidenceDefault,
      confidenceRationale: created.confidenceRationaleDefault,
      processingSteps: [
        { step: "seeded", note: "inserted directly for local dev — ogr2ogr/GDAL isn't installed here" },
      ],
      featureCount: 1,
    })
    .returning({ id: datasetVersion.id });
  if (!version) throw new Error("insert into dataset_version unexpectedly returned no row");

  await db.insert(evidenceFeature).values({
    datasetVersionId: version.id,
    sourceFeatureId: "seed-1",
    geom: seed.feature,
    attributes: { note: "illustrative test feature seeded for local development" },
  });

  await db.update(dataset).set({ currentVersionId: version.id }).where(eq(dataset.id, created.id));
  await mapToJurisdiction(staffActor, jurisdictionId, created.id, seed.key, {});
  console.log(`seeded dataset "${datasetKey}" and mapped it to ${seed.key}`);
}

const DEMO_STUDY_AREA = {
  type: "MultiPolygon" as const,
  coordinates: [
    [
      [
        [-122.03, 47.59],
        [-121.99, 47.59],
        [-121.99, 47.62],
        [-122.03, 47.62],
        [-122.03, 47.59],
      ],
    ],
  ],
};
const DEMO_FOOTPRINT = {
  type: "MultiPolygon" as const,
  coordinates: [
    [
      [
        [-122.02, 47.595],
        [-122.0, 47.595],
        [-122.0, 47.61],
        [-122.02, 47.61],
        [-122.02, 47.595],
      ],
    ],
  ],
};

async function ensureDemoDecision(jurisdictionId: string, plannerActor: Actor): Promise<string> {
  const title = "Sammamish Ridge Estates (test data)";
  const [existing] = await db
    .select({ id: decision.id })
    .from(decision)
    .where(and(eq(decision.jurisdictionId, jurisdictionId), eq(decision.title, title)));

  let decisionId: string;
  if (existing) {
    console.log(`demo decision "${title}" already exists (${existing.id}) — skipping creation`);
    decisionId = existing.id;
  } else {
    const created = await createDecision(plannerActor, {
      jurisdictionId,
      title,
      applicationType: "subdivision",
    });
    decisionId = created.id;
    await saveGeometry(
      plannerActor,
      decisionId,
      "study_area",
      DEMO_STUDY_AREA,
      "Seed: illustrative study area for local development — not a surveyed boundary.",
      1,
    );
    await saveGeometry(
      plannerActor,
      decisionId,
      "footprint",
      DEMO_FOOTPRINT,
      "Seed: illustrative proposed footprint for local development — not a real site plan.",
      1,
    );
    await setFilingDate(plannerActor, decisionId, "2026-08-01", 1);
    console.log(`created demo decision "${title}" (${decisionId}) with a study area and footprint`);
  }

  // Idempotent: runAnalysis pins its inputs and skips recomputing when they're unchanged (R8 of
  // evidence-base.md) — safe to call on every seed run, including one where nothing above ran.
  await runAnalysis(decisionId, "current");
  console.log(`ran analysis for demo decision ${decisionId}`);
  return decisionId;
}

async function main(): Promise<void> {
  const email = process.argv[2];
  if (!email) {
    throw new Error("usage: npx tsx --env-file=.env scripts/seed-local.ts <your-email>");
  }

  const [user] = await db.select().from(appUser).where(eq(appUser.email, email));
  if (!user) {
    throw new Error(
      `no app_user found for ${email} — sign in once at http://localhost:3000/sign-in with GitHub first, then re-run this script`,
    );
  }

  // graphile-worker installs its own schema the first time a worker process starts; a fresh local
  // database that has never run `npm run worker` doesn't have it yet, and saveGeometry/
  // setFilingDate below both enqueue a job in the same transaction as their write. Safe to call on
  // every run — it's a no-op once the schema is current.
  await runMigrations({ connectionString: env.DATABASE_URL });

  const jur = await ensureJurisdiction();

  await db.insert(staffMember).values({ userId: user.id, grantedBy: user.id }).onConflictDoNothing();
  await db
    .insert(membership)
    .values({ userId: user.id, jurisdictionId: jur.id, role: "planner", grantedBy: user.id })
    .onConflictDoNothing();
  console.log(`granted ${email} staff access and planner access to "Sammamish" (${jur.id})`);

  const reviewer = await ensureReviewerUser();
  await db
    .insert(membership)
    .values({ userId: reviewer.id, jurisdictionId: jur.id, role: "reviewer", grantedBy: user.id })
    .onConflictDoNothing();

  const plannerActor = await getActor(db, user.id);
  const reviewerActor = await getActor(db, reviewer.id);

  if (!jur.currentProfileVersionId) {
    await ensureSammamishProfile(jur.id, plannerActor, reviewerActor);
  } else {
    console.log("Sammamish already has an approved profile — skipping");
  }

  await resetIllustrativeEvidence();
  for (const seed of EVIDENCE_SEEDS) {
    await ensureEvidenceDataset(jur.id, plannerActor, seed);
  }

  await ensureDemoDecision(jur.id, plannerActor);

  console.log(`jurisdictionId to use in the app: ${jur.id}`);
  console.log(
    "Note: the demo decision's report is left in draft — releasing it renders a real PDF via the worker process (`npm run worker`), which this script doesn't start.",
  );
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
