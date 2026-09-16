// The package has no root export — Node's server-side entry is the "/node" subpath (see its
// package.json "exports" map); the plain "write-excel-file" specifier is browser/bundler-only.
// `writeXlsxFile(...)` itself is synchronous and returns a `{ toBuffer, toStream, toFile }`
// handle — the buffer is produced by calling `.toBuffer()` on that handle, not by a `buffer`
// option (there is none on `Options`).
import writeXlsxFile from "write-excel-file/node";
import type { Sheet } from "write-excel-file/node";

import { CURRENT_TEMPLATE_VERSION } from "./schema";

// TechDesign/profile-upload-edit.md — the template is generated from the same schema that
// validates uploads, so it can never name a field the parser doesn't also expect (R1).
// One sheet per array in ProfileDocumentSchema; column headers are the schema's own field names.

const RESOURCE_TYPES_SHEET: Sheet<Buffer> = {
  sheet: "resourceTypes",
  data: [[{ value: "key" }, { value: "label" }, { value: "ruleSet" }, { value: "mapStatus" }]],
};
const BUFFER_RULES_SHEET: Sheet<Buffer> = {
  sheet: "bufferRules",
  data: [
    [
      { value: "key" },
      { value: "resourceType" },
      { value: "appliesWhenAttribute" },
      { value: "appliesWhenEquals" },
      { value: "widthFt" },
      { value: "codeSection" },
      { value: "ordinance" },
      { value: "sourceUrl" },
      { value: "effectiveOn" },
      { value: "repealedOn" },
    ],
  ],
};
const STUDY_TRIGGERS_SHEET: Sheet<Buffer> = {
  sheet: "studyTriggers",
  data: [
    [
      { value: "key" },
      { value: "resourceType" },
      { value: "study" },
      { value: "withinFt" },
      { value: "codeSection" },
      { value: "ordinance" },
      { value: "sourceUrl" },
      { value: "effectiveOn" },
      { value: "repealedOn" },
    ],
  ],
};
const TREE_RULES_SHEET: Sheet<Buffer> = {
  sheet: "treeRules",
  data: [
    [
      { value: "kind" },
      { value: "key" },
      { value: "group" },
      { value: "minDbhIn" },
      { value: "maxCount" },
      { value: "periodYears" },
      { value: "codeSection" },
      { value: "ordinance" },
      { value: "sourceUrl" },
      { value: "effectiveOn" },
      { value: "repealedOn" },
    ],
  ],
};
const SETTINGS_SHEET: Sheet<Buffer> = {
  sheet: "settings",
  data: [[{ value: "settingType" }, { value: "key" }, { value: "field" }, { value: "value" }]],
};

export async function generateTemplate(): Promise<Buffer> {
  const file = writeXlsxFile([
    RESOURCE_TYPES_SHEET,
    BUFFER_RULES_SHEET,
    STUDY_TRIGGERS_SHEET,
    TREE_RULES_SHEET,
    SETTINGS_SHEET,
  ]);
  return file.toBuffer();
}

export { CURRENT_TEMPLATE_VERSION };
