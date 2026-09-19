import { describe, expect, it } from "vitest";

import { CATEGORICAL_PALETTE, darken, layerColor, paintFor } from "./map-styles";

describe("R2 of map-workspace.md: approximate boundaries are never color-only", () => {
  it("pairs a distinct pattern with the layer's own color for approximate", () => {
    const color = layerColor(0);
    const approximate = paintFor("approximate", color);
    expect(approximate.patternColor).not.toBeNull();
    expect(approximate.patternColor).not.toBe(color);
    expect(approximate.fillColor).toBe(color);
  });

  it("regulatory has no pattern — the two statuses are visually distinguishable at a glance", () => {
    expect(paintFor("regulatory", layerColor(0)).patternColor).toBeNull();
  });
});

describe("layerColor", () => {
  it("assigns colors from the fixed categorical order, never reassigned by position", () => {
    expect(layerColor(0)).toBe(CATEGORICAL_PALETTE[0]);
    expect(layerColor(1)).toBe(CATEGORICAL_PALETTE[1]);
  });

  it("cycles rather than throwing once every slot is used", () => {
    expect(layerColor(CATEGORICAL_PALETTE.length)).toBe(CATEGORICAL_PALETTE[0]);
  });
});

describe("darken", () => {
  it("produces a tone-on-tone shade, not an unrelated color", () => {
    const shade = darken("#2a78d6", 0.5);
    expect(shade).toMatch(/^#[0-9a-f]{6}$/);
    expect(shade).not.toBe("#2a78d6");
  });
});
