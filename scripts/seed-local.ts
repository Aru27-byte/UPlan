// Local-dev bootstrap only — never run against a real deployment (TechDesign/sample-data.md). It sets up what a
// fresh database needs before anyone can start a project, and nothing else:
//   1. the pilot cities (Sammamish, Redmond, Bellevue), created through the real createJurisdiction
//   2. staff access for the person named on the command line
//   3. an ILLUSTRATIVE profile for each city, applied through the real applyProfileDocument
//   4. the illustrative sample evidence datasets, for Sammamish only (the sample site is there; F23 R10),
//      through the real installSampleEvidence
//
// It creates no project. A person starts one from the dashboard ("Start with sample data"), which fills in
// every phase's input and queues the real analysis. Safe to re-run: each step skips what already exists.
//
// Run after registering once at /register (a person must exist in app_user before they can be made staff):
//
//   npm run db:seed:local -- you@example.com
import { eq } from "drizzle-orm";
import { runMigrations } from "graphile-worker";

import { appUser } from "../src/platform/auth-tables";
import { closeDb, db } from "../src/platform/db";
import { env } from "../src/platform/env";
import { getActor } from "../src/modules/accounts";
import { staffMember } from "../src/modules/accounts/tables";
import { installSampleEvidence } from "../src/modules/evidence";
import {
  BELLEVUE_SAMPLE_CODE,
  REDMOND_SAMPLE_CODE,
  SAMMAMISH_SAMPLE_CODE,
  SAMPLE_PROFILE_REASON,
  applyProfileDocument,
  buildSampleProfileDocument,
  createJurisdiction,
  getProfileOverview,
  listJurisdictions,
  type SampleCityCode,
} from "../src/modules/profiles";

// A rough bounding box, not a surveyed boundary — enough for the map to open on the right place. The three
// boxes don't overlap, so the sample site (in Sammamish) is covered by Sammamish's box alone (F23 R10).
function box(west: number, south: number, east: number, north: number) {
  return {
    type: "MultiPolygon" as const,
    coordinates: [
      [
        [
          [west, south],
          [east, south],
          [east, north],
          [west, north],
          [west, south],
        ],
      ],
    ],
  };
}

const CITIES: { name: string; boundary: ReturnType<typeof box>; code: SampleCityCode }[] = [
  { name: "Sammamish", boundary: box(-122.06, 47.55, -121.96, 47.65), code: SAMMAMISH_SAMPLE_CODE },
  { name: "Redmond", boundary: box(-122.17, 47.64, -122.07, 47.72), code: REDMOND_SAMPLE_CODE },
  { name: "Bellevue", boundary: box(-122.25, 47.53, -122.08, 47.64), code: BELLEVUE_SAMPLE_CODE },
];

async function makeStaff(userId: string, grantedBy: string): Promise<void> {
  await db.insert(staffMember).values({ userId, grantedBy }).onConflictDoNothing();
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

  const existingCities = await listJurisdictions();
  let sammamishId: string | null = null;
  for (const city of CITIES) {
    const existingCity = existingCities.find((c) => c.name === city.name);
    let cityId: string;
    if (existingCity) {
      cityId = existingCity.id;
      console.log(`the city "${city.name}" already exists (${cityId})`);
    } else {
      const created = await createJurisdiction(person, {
        name: city.name,
        stateCode: "WA",
        timeZone: "America/Los_Angeles",
        analysisSrid: 2926,
        boundary: city.boundary,
      });
      cityId = created.id;
      console.log(`created the city "${city.name}" (${cityId})`);
    }
    if (city.name === "Sammamish") sammamishId = cityId;

    const overview = await getProfileOverview(cityId);
    if (overview.versionNumber === null) {
      await applyProfileDocument(person, cityId, null, buildSampleProfileDocument(city.code), SAMPLE_PROFILE_REASON);
      console.log(`applied the illustrative ${city.name} profile`);
    } else {
      console.log(`${city.name} already has an approved profile (version ${overview.versionNumber}) — skipping`);
    }
  }

  // Sample evidence is placed on the sample site, which is in Sammamish (F23 R10).
  if (!sammamishId) throw new Error("Sammamish is missing after setup — this should not happen");
  const { created, existing } = await installSampleEvidence(person, sammamishId);
  console.log(`sample evidence (Sammamish): ${created.length} installed, ${existing.length} already present`);

  console.log("");
  console.log("Next: start the worker (`npm run worker:dev`), open http://localhost:3000, pick a city, and choose \"Start with sample data\" (Sammamish only).");
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
