import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

// TechDesign/project-dashboard.md, "The visual system" (R8): every text/fill pair the signed-in app uses meets
// WCAG 2.1 AA (4.5:1 for text). The values are read from globals.css, so changing a token that breaks a pair
// fails here rather than in front of a person.

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

function token(name: string): string {
  const match = new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  if (!match?.[1]) throw new Error(`globals.css has no --color-${name} token`);
  return match[1];
}

function channel(hex: string, start: number): number {
  const value = parseInt(hex.slice(start, start + 2), 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  if (light === undefined || dark === undefined) throw new Error("no luminance");
  return (light + 0.05) / (dark + 0.05);
}

const PAIRS: [text: string, fill: string][] = [
  ["text", "canvas"],
  ["text", "surface"],
  ["muted", "canvas"],
  ["muted", "surface"],
  ["surface", "brand"],
  ["surface", "brand-strong"],
  ["brand", "surface"],
  ["brand", "brand-soft"],
  ["brand", "canvas"],
  ["info", "info-soft"],
  ["info", "surface"],
  ["warn", "warn-soft"],
  ["warn", "surface"],
  ["danger", "danger-soft"],
  ["danger", "surface"],
  ["ok", "ok-soft"],
  ["nav-text", "nav"],
  ["nav-muted", "nav"],
  ["text", "warn-soft"],
  ["text", "info-soft"],
];

describe("R8: the signed-in app's colors meet WCAG 2.1 AA", () => {
  it.each(PAIRS)("R8: %s on %s is at least 4.5:1", (text, fill) => {
    expect(contrast(token(text), token(fill))).toBeGreaterThanOrEqual(4.5);
  });
});

describe("P1: measured numbers are rounded only by the provenance formatter", () => {
  it("R2: no page or component rounds a number with toFixed", async () => {
    const { globSync } = await import("node:fs");
    const files = [...globSync("src/app/**/*.{ts,tsx}"), ...globSync("src/ui/**/*.{ts,tsx}")].filter((f) => !f.endsWith(".test.ts") && !f.endsWith("auth-shell.tsx")); // auth-shell rounds decorative SVG coordinates, not a measurement
    const offenders = files.filter((f) => readFileSync(f, "utf8").includes(".toFixed("));
    expect(offenders).toEqual([]);
  });
});
