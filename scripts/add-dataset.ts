// Registers one REAL evidence dataset for the city and ingests it (TechDesign/evidence-layers.md, R1, R8). The
// app has no screen for this: a dataset is set up by UPlan staff, once, with its authority, precision, license,
// and limitation recorded from the publisher (never inferred from its features). This is the staff path.
//
//   npm run db:dataset:add -- you@example.com path/to/dataset.json
//
// Needs, on the machine that runs it: GDAL's `ogr2ogr` on PATH (ingestion loads the file with it), DATABASE_URL
// pointing at the database the app uses, and the OCI_S3_* variables pointing at an S3-compatible bucket the file
// is kept in (Supabase Storage's S3 endpoint works). The person must already be staff.
//
// The JSON file:
//   {
//     "key": "king-county-wetlands",                 unique, lowercase
//     "title": "Wetlands (King County)",
//     "publisher": "King County GIS Center",
//     "license": "Public domain",                   Public domain | CC0 | CC-BY | CC-BY-4.0 | ODbL
//     "sourceUrl": "https://.../file.geojson",      a direct download of GeoJSON, a zipped shapefile, or a GeoPackage
//     "authority": "county",                        federal | state | regional | county | local
//     "spatialPrecision": "regional",               site | parcel | regional | coarse
//     "knownLimitation": "Mapped from aerial photography; small wetlands are missed." | null,
//     "confidenceDefault": "moderate",              high | moderate | low
//     "confidenceRationaleDefault": "Why that confidence, in a sentence a commissioner can read.",
//     "publisherDateAttribute": "LAST_EDITED" | null,   the source attribute that holds the publisher's date
//     "sourceAsOfNoteDefault": "The publisher states no date." | null,   one of the two date fields is required
//     "resourceTypeKey": "wetlands",                 a resource type key in the city's profile
//     "attributeMap": { "category": "WETLAND_CAT" }, profile attribute name -> the source's field name
//     "coverage": "city-boundary"                    or a path to a GeoJSON file of the area the dataset covers
//   }
import { readFile } from "node:fs/promises";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { getActor } from "../src/modules/accounts";
import { appUser } from "../src/platform/auth-tables";
import { closeDb, db } from "../src/platform/db";
import { createDataset, ingestDataset, mapToJurisdiction } from "../src/modules/evidence";
import { getJurisdictionBoundary, listJurisdictions } from "../src/modules/profiles";

const AreaSchema = z.union([
  z.object({ type: z.literal("Polygon"), coordinates: z.array(z.array(z.array(z.number()))) }),
  z.object({ type: z.literal("MultiPolygon"), coordinates: z.array(z.array(z.array(z.array(z.number())))) }),
]);

const ConfigSchema = z.object({
  key: z.string().min(1),
  title: z.string().min(1),
  publisher: z.string().min(1),
  license: z.string().min(1),
  sourceUrl: z.url(),
  authority: z.enum(["federal", "state", "regional", "county", "local"]),
  spatialPrecision: z.enum(["site", "parcel", "regional", "coarse"]),
  knownLimitation: z.string().min(1).nullable(),
  confidenceDefault: z.enum(["high", "moderate", "low"]),
  confidenceRationaleDefault: z.string().min(1),
  publisherDateAttribute: z.string().min(1).nullable(),
  sourceAsOfNoteDefault: z.string().min(1).nullable(),
  resourceTypeKey: z.string().min(1),
  attributeMap: z.record(z.string(), z.string()),
  coverage: z.string().min(1),
});

async function main(): Promise<void> {
  const [email, configPath] = process.argv.slice(2);
  if (!email || !configPath) throw new Error("usage: npm run db:dataset:add -- <staff email> <path to dataset.json>");

  const parsed = ConfigSchema.safeParse(JSON.parse(await readFile(configPath, "utf8")));
  if (!parsed.success) {
    throw new Error(`the dataset file is not valid:\n${parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n")}`);
  }
  const config = parsed.data;
  if (config.publisherDateAttribute === null && config.sourceAsOfNoteDefault === null) {
    throw new Error("give publisherDateAttribute, or sourceAsOfNoteDefault saying why the publisher states no date");
  }

  const [user] = await db.select().from(appUser).where(eq(appUser.email, email));
  if (!user) throw new Error(`no person registered with ${email}`);
  const actor = await getActor(db, user.id);
  if (!actor.isStaff) throw new Error(`${email} is not UPlan staff`);

  const [city, ...others] = await listJurisdictions();
  if (!city || others.length > 0) throw new Error("this release supports exactly one city");

  // Coverage is the area the dataset is known to cover. A county-wide layer covers the city, so the city's own
  // boundary is a true statement; anything narrower is a GeoJSON file the person supplies.
  const area = AreaSchema.safeParse(
    config.coverage === "city-boundary" ? await getJurisdictionBoundary(city.id) : JSON.parse(await readFile(config.coverage, "utf8")),
  );
  if (!area.success) throw new Error("coverage must be a GeoJSON Polygon or MultiPolygon (a geometry, not a FeatureCollection)");
  const coverage =
    area.data.type === "Polygon"
      ? { type: "MultiPolygon" as const, coordinates: [area.data.coordinates] }
      : { type: "MultiPolygon" as const, coordinates: area.data.coordinates };

  const created = await createDataset(actor, {
    key: config.key,
    title: config.title,
    publisher: config.publisher,
    license: config.license,
    sourceUrl: config.sourceUrl,
    authority: config.authority,
    spatialPrecision: config.spatialPrecision,
    isSample: false,
    coverage,
    knownLimitation: config.knownLimitation,
    confidenceDefault: config.confidenceDefault,
    confidenceRationaleDefault: config.confidenceRationaleDefault,
    publisherDateAttribute: config.publisherDateAttribute,
    sourceAsOfNoteDefault: config.sourceAsOfNoteDefault,
  });
  await mapToJurisdiction(actor, city.id, created.id, config.resourceTypeKey, config.attributeMap);
  console.log(`registered "${config.title}" and mapped it to ${config.resourceTypeKey}; ingesting from ${config.sourceUrl} …`);

  await ingestDataset(created.id);
  console.log("ingested. Open projects whose study area it covers are queued for analysis (run the worker to process them).");
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
