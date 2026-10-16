import { describe, expect, it } from "vitest";

import { resolveCity } from "./city-choice";

const sammamish = { id: "11111111-1111-4111-8111-111111111111", name: "Sammamish" };
const redmond = { id: "22222222-2222-4222-8222-222222222222", name: "Redmond" };
const bellevue = { id: "33333333-3333-4333-8333-333333333333", name: "Bellevue" };
const cities = [bellevue, redmond, sammamish];

describe("resolveCity", () => {
  it("R13: the only city is the current city without a choice", () => {
    expect(resolveCity([sammamish], undefined)).toEqual({ kind: "city", city: sammamish, cities: [sammamish] });
  });

  it("R13: the only city wins over a remembered choice that names a city that is gone", () => {
    expect(resolveCity([sammamish], redmond.id)).toEqual({ kind: "city", city: sammamish, cities: [sammamish] });
  });

  it("R11: with several cities, the chosen one is the current city", () => {
    expect(resolveCity(cities, redmond.id)).toEqual({ kind: "city", city: redmond, cities });
  });

  it("R13: with several cities and no choice, the person is asked and no city is guessed", () => {
    expect(resolveCity(cities, undefined)).toEqual({ kind: "choose", cities });
  });

  it("R13: a remembered choice that is no longer a city asks again", () => {
    expect(resolveCity(cities, "99999999-9999-4999-8999-999999999999")).toEqual({ kind: "choose", cities });
  });

  it("R13: a remembered value that is not an id asks again", () => {
    expect(resolveCity(cities, "not-a-uuid")).toEqual({ kind: "choose", cities });
    expect(resolveCity(cities, "")).toEqual({ kind: "choose", cities });
  });

  it("R13: with no city set up, it is a problem that says how staff fix it", () => {
    const result = resolveCity([], redmond.id);
    expect(result.kind).toBe("problem");
    if (result.kind === "problem") expect(result.message).toContain("setup script");
  });
});
