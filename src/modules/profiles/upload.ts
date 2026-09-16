// `readXlsxFile` (the default export) only ever reads the first sheet — reading one named sheet
// among several needs the dedicated `readSheet(input, sheetName)` export instead.
import { readSheet, type Row } from "read-excel-file/node";

import { CURRENT_TEMPLATE_VERSION, ProfileDocumentSchema, type ProfileDocument } from "./schema";

// TechDesign/profile-upload-edit.md — every problem is collected before validating the whole
// document (R2: a planner never fixes one error only to discover a second).

export type UploadResult = { ok: true; document: ProfileDocument } | { ok: false; errors: string[] };

// `Row` (string | number | boolean | Date | null, per read-excel-file's own types) rather than
// `unknown[][]` — every cell then has a type `String()` can always render safely, satisfying
// @typescript-eslint/no-base-to-string without weakening what a `String(cell)` call actually does.
function rowsAfterHeader(rows: Row[]): Row[] {
  return rows.slice(1);
}

// A named call per sheet (rather than `.map()` over a names array) so Promise.all infers a fixed
// 5-tuple of concrete `Row[]` results — no destructured element is possibly `undefined`.
async function readSheetSafely(fileBuffer: Buffer, sheet: string, errors: string[]): Promise<Row[]> {
  try {
    return await readSheet(fileBuffer, sheet);
  } catch {
    errors.push(`missing or unreadable sheet "${sheet}"`);
    return [];
  }
}

export async function parseUpload(fileBuffer: Buffer): Promise<UploadResult> {
  const errors: string[] = [];

  const [resourceTypeRows, bufferRuleRows, studyTriggerRows, treeRuleRows, settingsRows] = await Promise.all([
    readSheetSafely(fileBuffer, "resourceTypes", errors),
    readSheetSafely(fileBuffer, "bufferRules", errors),
    readSheetSafely(fileBuffer, "studyTriggers", errors),
    readSheetSafely(fileBuffer, "treeRules", errors),
    readSheetSafely(fileBuffer, "settings", errors),
  ]);

  if (errors.length > 0) return { ok: false, errors };

  const resourceTypes = rowsAfterHeader(resourceTypeRows).map((r) => ({
    key: String(r[0]),
    label: String(r[1]),
    ruleSet: String(r[2]),
    mapStatus: String(r[3]),
  }));

  const citationOf = (
    codeSection: Row[number] | undefined,
    ordinance: Row[number] | undefined,
    sourceUrl: Row[number] | undefined,
  ) => ({
    codeSection: String(codeSection),
    ordinance: ordinance ? String(ordinance) : null,
    sourceUrl: String(sourceUrl),
  });

  const bufferRules = rowsAfterHeader(bufferRuleRows).map((r) => ({
    key: String(r[0]),
    resourceType: String(r[1]),
    appliesWhen: r[2] ? { attribute: String(r[2]), equals: String(r[3]) } : null,
    widthFt: Number(r[4]),
    citation: citationOf(r[5], r[6], r[7]),
    effectiveOn: String(r[8]),
    repealedOn: r[9] ? String(r[9]) : null,
  }));

  const studyTriggers = rowsAfterHeader(studyTriggerRows).map((r) => ({
    key: String(r[0]),
    resourceType: String(r[1]),
    study: String(r[2]),
    withinFt: Number(r[3]),
    citation: citationOf(r[4], r[5], r[6]),
    effectiveOn: String(r[7]),
    repealedOn: r[8] ? String(r[8]) : null,
  }));

  const treeRules = rowsAfterHeader(treeRuleRows).map((r) => {
    const base = {
      key: String(r[1]),
      citation: citationOf(r[6], r[7], r[8]),
      effectiveOn: String(r[9]),
      repealedOn: r[10] ? String(r[10]) : null,
    };
    return r[0] === "significant-tree"
      ? { kind: "significant-tree" as const, ...base, group: String(r[2]), minDbhIn: Number(r[3]) }
      : { kind: "removal-cap" as const, ...base, maxCount: Number(r[4]), periodYears: Number(r[5]) };
  });

  const settingsRowsAfterHeader = rowsAfterHeader(settingsRows);
  const vesting = settingsRowsAfterHeader
    .filter((r) => r[0] === "vesting")
    .map((r) => ({ ruleSet: String(r[1]), vests: String(r[3]).toLowerCase() === "true" }));
  const retention = settingsRowsAfterHeader
    .filter((r) => r[0] === "retention")
    .map((r) => ({ recordType: String(r[1]), retainYears: Number(r[3]), countFrom: "created" as const }));
  const exportFormatsRow = settingsRowsAfterHeader.find((r) => r[0] === "exportFormats");
  const exportFormats = exportFormatsRow
    ? String(exportFormatsRow[3])
        .split(",")
        .map((s) => s.trim())
    : [];

  const candidate = {
    schemaVersion: 1 as const,
    resourceTypes,
    bufferRules,
    studyTriggers,
    treeRules,
    settings: { vesting, retention, exportFormats },
  };

  const result = ProfileDocumentSchema.safeParse(candidate);
  if (!result.success) {
    return { ok: false, errors: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  }
  return { ok: true, document: result.data };
}

export { CURRENT_TEMPLATE_VERSION };
