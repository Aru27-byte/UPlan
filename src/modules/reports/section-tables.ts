import type { PhaseKey } from "./snapshot";

// TechDesign/research-phases.md, "Section versions": a stored section may set a table's caption and
// reorder its columns, never drop one — every provenance column is locked. This is the one canonical
// list of tables and columns a section prints, read by the document, the live preview, and the
// workflow's validation before a version is stored.

export type SectionTableDef = { key: string; columns: readonly string[] };

export const SECTION_TABLES = {
  site: [],
  evidence: [{ key: "resolutions", columns: ["resourceType", "sources", "reliedOn", "reason", "recordedBy"] }],
  screening: [{ key: "screening", columns: ["resourceType", "finding", "source", "confidence"] }],
  studies: [],
  footprint: [],
  impact: [{ key: "impact", columns: ["resourceType", "measure", "quantity", "source", "confidence", "citation"] }],
} as const satisfies Record<PhaseKey, readonly SectionTableDef[]>;

export function sectionTableDefs(phase: PhaseKey): readonly SectionTableDef[] {
  return SECTION_TABLES[phase];
}

export function isPermutation(order: readonly string[], columns: readonly string[]): boolean {
  if (order.length !== columns.length) return false;
  const wanted = new Set(columns);
  if (new Set(order).size !== order.length) return false;
  return order.every((key) => wanted.has(key));
}
