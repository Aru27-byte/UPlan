import { listJurisdictions } from "@/modules/profiles";

// TechDesign/project-dashboard.md, "The shell": this release supports exactly one city (decided 2026-09-26),
// so the city is the one jurisdiction that exists. No jurisdiction, or more than one, is stated plainly — there
// is no default city standing in for a missing one, and no guess about which of several is meant. The
// layout shows the message in place of the page, so the person and the operator both see it.
export type CityResult =
  | { kind: "city"; city: Awaited<ReturnType<typeof listJurisdictions>>[number] }
  | { kind: "problem"; message: string };

export async function getCity(): Promise<CityResult> {
  const cities = await listJurisdictions();
  const [only] = cities;
  if (!only) {
    return {
      kind: "problem",
      message:
        "No city is set up in UPlan yet. UPlan staff create one with the setup script (see LOCAL_HOSTING.md, step 7), and then this page works.",
    };
  }
  if (cities.length > 1) {
    return {
      kind: "problem",
      message: `${cities.length} cities are set up, but this release of UPlan supports one. Remove the extra ones or ask UPlan staff.`,
    };
  }
  return { kind: "city", city: only };
}
