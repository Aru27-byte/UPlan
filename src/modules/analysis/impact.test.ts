import { describe, expect, it } from "vitest";

import { evaluateAppliesWhen } from "./impact";

const appliesWhen = { attribute: "wetlandRating", equals: "Category I" };
const attributeMap = { wetlandRating: "WETLAND_TY" };

describe("R9: a buffer applies only when its condition is met by the feature's recorded attributes", () => {
  it("returns 'yes' when there is no condition at all", () => {
    expect(evaluateAppliesWhen(null, {}, {})).toBe("yes");
  });

  it("returns 'yes' when the mapped attribute matches", () => {
    expect(evaluateAppliesWhen(appliesWhen, { WETLAND_TY: "Category I" }, attributeMap)).toBe("yes");
  });

  it("returns 'no' when the mapped attribute is present but doesn't match", () => {
    expect(evaluateAppliesWhen(appliesWhen, { WETLAND_TY: "Category III" }, attributeMap)).toBe("no");
  });

  it("R3: returns 'unknown' — never 'yes' or 'no' — when the attribute is simply missing from the evidence", () => {
    expect(evaluateAppliesWhen(appliesWhen, {}, attributeMap)).toBe("unknown");
  });

  it("returns 'unknown' when the jurisdiction's attribute map doesn't cover this rule's attribute", () => {
    expect(evaluateAppliesWhen(appliesWhen, { WETLAND_TY: "Category I" }, {})).toBe("unknown");
  });
});
