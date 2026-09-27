// Local-dev bootstrap only — never run against a real deployment (TechDesign/sample-data.md). It sets up what a
// fresh database needs before anyone can start a project, and nothing else:
//   1. the one city (Sammamish), created through the real createJurisdiction
//   2. staff access for the person named on the command line, and a synthetic UPlan-staff reviewer account
//      (profile_change_no_self_approval forbids a person from approving their own proposed change, and only
//      one real person signs in on a local machine)
//   3. an approved ILLUSTRATIVE Sammamish profile, through the real proposeEdit / decideChange flow
//   4. the illustrative sample evidence datasets, through the real installSampleEvidence
//
// It creates no project. A person starts one from the dashboard ("Start with sample data"), which fills in
// every phase's input and queues the real analysis. Safe to re-run: each step skips what already exists.
//
// Run after registering once at /register (a person must exist in app_user before they can be made staff):
//
//   npm run db:seed:local -- you@example.com
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { runMigrations } from "graphile-worker";

import { appUser } from "../src/platform/auth-tables";
import { closeDb, db } from "../src/platform/db";
import { env } from "../src/platform/env";
import { getActor } from "../src/modules/accounts";
import { staffMember } from "../src/modules/accounts/tables";
import { installSampleEvidence } from "../src/modules/evidence";
import {
  SAMPLE_PROFILE_REASON,
  buildSampleProfileDocument,
  createJurisdiction,
  decideChange,
  getProfileOverview,
  listJurisdictions,
  proposeEdit,
} from "../src/modules/profiles";

const SAMMAMISH_BOUNDARY = {
  type: "MultiPolygon" as const,
  // A rough bounding box, not a surveyed boundary — enough for the map to open on the right place.
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

async function makeStaff(userId: string, grantedBy: string): Promise<void> {
  await db.insert(staffMember).values({ userId, grantedBy }).onConflictDoNothing();
}

async function ensureReviewerUser(): Promise<string> {
  const email = "uplan-review-bot@uplan.local";
  const [existing] = await db.select({ id: appUser.id }).from(appUser).where(eq(appUser.email, email));
  if (existing) return existing.id;
  const [created] = await db
    .insert(appUser)
    .values({ id: randomUUID(), name: "UPlan review bot (seed)", email })
    .returning({ id: appUser.id });
  if (!created) throw new Error("insert into app_user unexpectedly returned no row");
  console.log(`created synthetic reviewer account ${email} (${created.id}) — approves the seeded profile only, never signs in`);
  return created.id;
}

async function main(): Promise<void> {
  if (env.NODE_ENV === "production") throw new Error("this script is for local development and refuses to run in production");

  const email = process.argv[2];
  if (!email) throw new Error("usage: npm run db:seed:local -- <the email you registered with> [--allow-remote]");

  // This grants staff rights and approves an illustrative profile, so it must not run against a hosted
  // database by accident (a .env that points at a real project is easy to forget).
  const host = new URL(env.DATABASE_URL).hostname;
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host) && !process.argv.includes("--allow-remote")) {
    throw new Error(`DATABASE_URL points at ${host}, which isn't this machine. Re-run with --allow-remote only if you mean to seed that database.`);
  }

  const [user] = await db.select().from(appUser).where(eq(appUser.email, email));
  if (!user) {
    throw new Error(`no app_user found for ${email} — register once at http://localhost:3000/register first, then re-run this script`);
  }

  // graphile-worker installs its own schema the first time a worker starts; a fresh database that has never
  // run one doesn't have it, and the first saved boundary enqueues a job in the same transaction as its write.
  // A no-op once the schema is current.
  await runMigrations({ connectionString: env.DATABASE_URL });

  await makeStaff(user.id, user.id);
  const person = await getActor(db, user.id);
  console.log(`${email} is UPlan staff`);

  const cities = await listJurisdictions();
  let cityId: string;
  if (cities.length > 1) throw new Error(`${cities.length} cities exist, but this release supports one — remove the extras first`);
  const [existingCity] = cities;
  if (existingCity) {
    cityId = existingCity.id;
    console.log(`the city "${existingCity.name}" already exists (${cityId})`);
  } else {
    const created = await createJurisdiction(person, {
      name: "Sammamish",
      stateCode: "WA",
      timeZone: "America/Los_Angeles",
      analysisSrid: 2926,
      boundary: SAMMAMISH_BOUNDARY,
    });
    cityId = created.id;
    console.log(`created the city "Sammamish" (${cityId})`);
  }

  const overview = await getProfileOverview(cityId);
  if (overview.versionNumber === null) {
    const reviewerId = await ensureReviewerUser();
    await makeStaff(reviewerId, user.id);
    const reviewer = await getActor(db, reviewerId);
    const change = await proposeEdit(person, cityId, buildSampleProfileDocument(), SAMPLE_PROFILE_REASON);
    await decideChange(reviewer, change.id, "approved", "Seeded illustrative profile for local development.");
    console.log("approved the illustrative Sammamish profile");
  } else {
    console.log(`the city already has an approved profile (version ${overview.versionNumber}) — skipping`);
  }

  const { created, existing } = await installSampleEvidence(person, cityId);
  console.log(`sample evidence: ${created.length} installed, ${existing.length} already present`);

  console.log("");
  console.log("Next: start the worker (`npm run worker:dev`), open http://localhost:3000, and choose \"Start with sample data\".");
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
