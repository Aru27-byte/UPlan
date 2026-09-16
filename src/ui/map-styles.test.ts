import { describe, expect, it } from "vitest";

import { paintFor } from "./map-styles";

describe("R2 of map-workspace.md: approximate boundaries are never color-only", () => {
  it("pairs a distinct color with a hatch pattern for approximate", () => {
    const approximate = paintFor("approximate");
    const regulatory = paintFor("regulatory");
    expect(approximate.fillPattern).not.toBeNull();
    expect(approximate.fillColor).not.toBe(regulatory.fillColor);
  });

  it("regulatory has no pattern — the two statuses are visually distinguishable at a glance", () => {
    expect(paintFor("regulatory").fillPattern).toBeNull();
  });
});
