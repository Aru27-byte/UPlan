import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

// TechDesign/project-dashboard.md, "The visual system" (R8): every text/fill pair UPlan's pages use meets
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
  // Text on the page, a panel, a quiet block inside one, and a hovered row
  ["heading", "page"],
  ["text", "page"],
  ["muted", "page"],
  ["faint", "page"],
  ["heading", "surface"],
  ["text", "surface"],
  ["muted", "surface"],
  ["faint", "surface"],
  ["text", "canvas"],
  ["muted", "canvas"],
  ["faint", "canvas"],
  ["text", "raised"],
  ["muted", "raised"],
  ["brand", "surface"],
  ["brand", "canvas"],
  ["brand", "brand-soft"],
  // The four states, on their own tint and on a panel
  ["info", "info-soft"],
  ["info", "surface"],
  ["warn", "warn-soft"],
  ["warn", "surface"],
  ["danger", "danger-soft"],
  ["danger", "surface"],
  ["danger", "canvas"],
  ["ok", "ok-soft"],
  ["ok", "surface"],
  ["text", "warn-soft"],
  ["text", "info-soft"],
  ["text", "ok-soft"],
  ["text", "danger-soft"],
  // Ink on every accent fill: the primary button, chips, and stage numbers
  ["ink", "accent-green"],
  ["ink", "accent-lime"],
  ["ink", "accent-gold"],
  ["ink", "accent-blue"],
  ["ink", "accent-steel"],
  ["ink", "accent-tan"],
  ["ink", "accent-teal"],
  ["ink", "accent-butter"],
  // Accents used as text: the research groups' captions and the landing page's labels
  ["accent-lime", "surface"],
  ["accent-gold", "surface"],
  ["accent-blue", "surface"],
  ["accent-tan", "surface"],
  ["accent-green", "page"],
  // The navigation
  ["nav-text", "nav"],
  ["nav-muted", "nav"],
];

describe("R8: UPlan's colors meet WCAG 2.1 AA", () => {
  it.each(PAIRS)("R8: %s on %s is at least 4.5:1", (text, fill) => {
    expect(contrast(token(text), token(fill))).toBeGreaterThanOrEqual(4.5);
  });
});

describe("P1: measured numbers are rounded only by the provenance formatter", () => {
  it("R2: no page or component rounds a number with toFixed", async () => {
    const { globSync } = await import("node:fs");
    const files = [...globSync("src/app/**/*.{ts,tsx}"), ...globSync("src/ui/**/*.{ts,tsx}")].filter((f) => !f.endsWith(".test.ts"));
    const offenders = files.filter((f) => readFileSync(f, "utf8").includes(".toFixed("));
    expect(offenders).toEqual([]);
  });
});
