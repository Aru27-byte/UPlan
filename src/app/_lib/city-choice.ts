// TechDesign/project-dashboard.md, "Switching cities" (R11–R13). Which city a page is about: the one city
// there is, or the one the person chose. Pure, so the rules are tested without a database or a request.

/** The cookie that remembers the person's choice: a city's id. A convenience, not an authority (R13). */
export const CITY_COOKIE = "uplan_city";

export type CityResolution<T extends { id: string }> =
  | { kind: "city"; city: T; cities: T[] }
  | { kind: "choose"; cities: T[] }
  | { kind: "problem"; message: string };

// R13: never a guess. One city needs no choice. With several, only a remembered id that names one of them
// counts; a missing, malformed, or stale id means the person has not chosen, and they are asked.
export function resolveCity<T extends { id: string }>(cities: T[], chosenId: string | undefined): CityResolution<T> {
  const [only] = cities;
  if (!only) {
    return {
      kind: "problem",
      message:
        "No city is set up in UPlan yet. UPlan staff create one with the setup script (see LOCAL_HOSTING.md, step 7), and then this page works.",
    };
  }
  if (cities.length === 1) return { kind: "city", city: only, cities };
  const chosen = cities.find((c) => c.id === chosenId);
  return chosen ? { kind: "city", city: chosen, cities } : { kind: "choose", cities };
}
