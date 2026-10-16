import { cookies } from "next/headers";
import { cache } from "react";

import { listJurisdictions } from "@/modules/profiles";

import { CITY_COOKIE, resolveCity, type CityResolution } from "./city-choice";

// TechDesign/project-dashboard.md, "The shell" and "Switching cities": the current city is the one city
// there is, or the one the person chose (city-choice.ts). With none set up, or with several and no valid
// choice, the result says so and the layout shows that in place of the page, so the person and the operator
// both see it. There is no default city standing in for a missing one, and no guess about which of several
// is meant.
export type City = Awaited<ReturnType<typeof listJurisdictions>>[number];
export type CityResult = CityResolution<City>;

// `cache` is React's per-request memo, not Next.js data caching (do-not.md): the layout and the page both
// ask for the city in one request and share one read; the next request reads it afresh.
export const getCity = cache(async (): Promise<CityResult> => {
  const [cities, cookieStore] = await Promise.all([listJurisdictions(), cookies()]);
  return resolveCity(cities, cookieStore.get(CITY_COOKIE)?.value);
});
